// ---------------------------------------------------------------------------
// lib/scheduler.js — penjadwal deterministik Jarvis Akademik.
//
// Prinsip: LLM TIDAK menghitung jam. Agent hanya memutuskan prioritas
// (bobot, target %, hari tidak tersedia), lalu memanggil fungsi ini lewat
// tool `susun_ulang_jadwal`. Fungsi ini menjamin:
//   1. tidak ada blok yang bentrok dengan event lain / waktu tidak tersedia,
//   2. semua blok berada di jam belajar yang diizinkan,
//   3. blok sebuah tugas selesai sebelum deadline (dikurangi buffer),
//   4. beban harian dan beban per tugas per hari dibatasi.
// Algoritma: Earliest Deadline First (EDF) greedy, potong per blok.
// Butuh lib/time.js.
// ---------------------------------------------------------------------------

const SCHED_DEFAULTS = {
  study_start: '08:00',
  study_end: '22:00',
  max_daily_minutes: 300,
  max_task_minutes_per_day: 120,
  block_max_minutes: 90,
  block_min_minutes: 30,
  break_minutes: 15,
  horizon_days: 14,
  deadline_buffer_minutes: 120,
  tz_offset_minutes: 420,
  rest_days: '', // mis. "0" (Minggu) atau "0,6"
  busy_all_day: 'false',
};

function readConfig(settings) {
  const s = Object.assign({}, SCHED_DEFAULTS, settings || {});
  const num = (k) => {
    const n = Number(s[k]);
    return Number.isFinite(n) ? n : Number(SCHED_DEFAULTS[k]);
  };
  return {
    studyStart: parseHHMM(s.study_start, 8 * 60),
    studyEnd: parseHHMM(s.study_end, 22 * 60),
    maxDaily: num('max_daily_minutes'),
    maxTaskDay: num('max_task_minutes_per_day'),
    blockMax: num('block_max_minutes'),
    blockMin: num('block_min_minutes'),
    breakMin: num('break_minutes'),
    horizonDays: num('horizon_days'),
    bufferMin: num('deadline_buffer_minutes'),
    offset: num('tz_offset_minutes'),
    restDays: String(s.rest_days || '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x !== '')
      .map(Number),
    busyAllDay: String(s.busy_all_day) === 'true',
  };
}

/**
 * Event Google Calendar (JSON API) -> interval sibuk.
 * Event all-day dan event "transparent" (Available) diabaikan kecuali diminta.
 */
function gcalEventsToBusy(events, cfg, label) {
  const out = [];
  for (const ev of events || []) {
    if (!ev || ev.status === 'cancelled' || !ev.start) continue;
    if (ev.transparency === 'transparent') continue;
    let s;
    let e;
    if (ev.start.dateTime) {
      s = new Date(ev.start.dateTime);
      e = new Date((ev.end && ev.end.dateTime) || ev.start.dateTime);
    } else if (ev.start.date) {
      if (!cfg.busyAllDay) continue;
      const [y, m, d] = ev.start.date.split('-').map(Number);
      s = localToDate(y, m, d, 0, 0, cfg.offset);
      const [y2, m2, d2] = ((ev.end && ev.end.date) || ev.start.date).split('-').map(Number);
      e = localToDate(y2, m2, d2, 0, 0, cfg.offset);
    } else {
      continue;
    }
    if (!(e > s)) continue; // event 0 menit (mis. deadline Lentera) bukan waktu sibuk
    out.push({ start: s, end: e, label: label || ev.summary || 'event' });
  }
  return out;
}

/** Gabungkan interval yang tumpang tindih. */
function mergeIntervals(list) {
  const sorted = (list || [])
    .filter((x) => x && x.end > x.start)
    .map((x) => ({ start: new Date(x.start), end: new Date(x.end) }))
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      out.push(cur);
    }
  }
  return out;
}

/** Slot kosong per hari di jam belajar, dikurangi waktu sibuk. */
function buildFreeSlots(now, busy, cfg) {
  const begin = ceilToStep(new Date(now.getTime() + 5 * MS_MIN), 15);
  const day0 = startOfLocalDay(now, cfg.offset);
  const merged = mergeIntervals(busy);
  const slots = [];
  for (let i = 0; i <= cfg.horizonDays; i++) {
    const dayStart = new Date(day0.getTime() + i * MS_DAY);
    const p = localParts(dayStart, cfg.offset);
    if (cfg.restDays.includes(p.dow)) continue;
    let ws = new Date(dayStart.getTime() + cfg.studyStart * MS_MIN);
    const we = new Date(dayStart.getTime() + cfg.studyEnd * MS_MIN);
    if (we <= begin) continue;
    if (ws < begin) ws = begin;
    let cursor = ws;
    const dayKey = localDateKey(dayStart, cfg.offset);
    for (const b of merged) {
      if (b.end <= cursor || b.start >= we) continue;
      if (b.start > cursor) slots.push({ s: cursor, e: new Date(Math.min(b.start, we)), dayKey });
      if (b.end > cursor) cursor = b.end;
      if (cursor >= we) break;
    }
    if (cursor < we) slots.push({ s: cursor, e: we, dayKey });
  }
  return slots.filter((x) => (x.e - x.s) / MS_MIN >= Math.min(cfg.blockMin, 15));
}

function remainingMinutes(t) {
  const target = Number.isFinite(Number(t.target_pct)) ? Number(t.target_pct) : 100;
  const effort = Number(t.effort_minutes) || 0;
  const done = Number(t.done_minutes) || 0;
  return Math.max(0, Math.round((effort * target) / 100) - done);
}

/**
 * Jadwalkan tugas.
 * @param {{now: Date, tasks: object[], busy: {start,end}[], settings: object}} input
 * @returns {{blocks, infeasible, overdue, perDay, stats, config}}
 */
function scheduleTasks({ now, tasks, busy, settings }) {
  const cfg = readConfig(settings);
  const slots = buildFreeSlots(now, busy, cfg);
  const horizonEnd = new Date(startOfLocalDay(now, cfg.offset).getTime() + (cfg.horizonDays + 1) * MS_DAY);
  const dayUsed = {};
  const blocks = [];
  const infeasible = [];
  const overdue = [];

  const queue = [];
  for (const t of tasks || []) {
    if (t.status && t.status !== 'open') continue;
    const need = remainingMinutes(t);
    if (need <= 0) continue;
    const deadline = t.deadline ? new Date(t.deadline) : null;
    if (deadline && deadline <= now) {
      overdue.push({ task_id: t.id, title: t.title, course: t.course, deadline: deadline.toISOString(), remaining_minutes: need });
      continue;
    }
    let due = deadline ? new Date(deadline.getTime() - cfg.bufferMin * MS_MIN) : horizonEnd;
    if (deadline && due <= now) due = deadline; // deadline mepet: buffer dilepas
    if (due > horizonEnd) due = horizonEnd;
    queue.push({ t, need, deadline, due });
  }

  queue.sort((a, b) => {
    const da = a.deadline ? a.deadline.getTime() : Infinity;
    const db = b.deadline ? b.deadline.getTime() : Infinity;
    if (da !== db) return da - db;
    const w = (Number(b.t.weight) || 0) - (Number(a.t.weight) || 0);
    if (w !== 0) return w;
    return (Number(a.t.id) || 0) - (Number(b.t.id) || 0);
  });

  for (const q of queue) {
    let remaining = q.need;
    const taskDay = {};
    // Pass 1: hormati batas per tugas per hari (agar belajar tersebar).
    // Pass 2: kalau masih kurang, batas itu dilepas (lebih baik padat daripada
    // tidak selesai). Batas total harian tetap berlaku di kedua pass.
    for (const perTaskCap of [cfg.maxTaskDay, Infinity]) {
      for (const slot of slots) {
        if (remaining <= 0 || slot.s >= q.due) break;
        // Satu slot bisa menampung beberapa blok berturut-turut.
        for (;;) {
          if (remaining <= 0 || slot.s >= q.due) break;
          const usable = (Math.min(slot.e, q.due) - slot.s) / MS_MIN;
          const dayLeft = cfg.maxDaily - (dayUsed[slot.dayKey] || 0);
          const taskLeft = perTaskCap - (taskDay[slot.dayKey] || 0);
          let chunk = Math.min(cfg.blockMax, remaining, usable, dayLeft, taskLeft);
          chunk = Math.floor(chunk / 5) * 5;
          if (chunk <= 0 || chunk < Math.min(cfg.blockMin, remaining)) break;
          const start = new Date(slot.s);
          const end = new Date(start.getTime() + chunk * MS_MIN);
          blocks.push({ task: q.t, start, end, minutes: chunk, dayKey: slot.dayKey, deadline: q.deadline });
          slot.s = new Date(end.getTime() + cfg.breakMin * MS_MIN);
          if (slot.s > slot.e) slot.s = new Date(slot.e);
          dayUsed[slot.dayKey] = (dayUsed[slot.dayKey] || 0) + chunk;
          taskDay[slot.dayKey] = (taskDay[slot.dayKey] || 0) + chunk;
          remaining -= chunk;
        }
      }
    }
    if (remaining > 0) {
      const scheduled = q.need - remaining;
      infeasible.push({
        task_id: q.t.id,
        title: q.t.title,
        course: q.t.course,
        weight: q.t.weight,
        deadline: q.deadline ? q.deadline.toISOString() : null,
        needed_minutes: q.need,
        scheduled_minutes: scheduled,
        feasible_pct: Math.round((scheduled / q.need) * 100),
      });
    }
  }

  blocks.sort((a, b) => a.start - b.start);
  const out = blocks.map((b) => {
    const t = b.task;
    const course = t.course ? `${t.course}: ` : '';
    const dl = b.deadline ? fmtLocal(b.deadline, cfg.offset) : 'tanpa deadline';
    return {
      task_id: t.id,
      title: t.title,
      course: t.course || '',
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      start_local: isoLocal(b.start, cfg.offset),
      end_local: isoLocal(b.end, cfg.offset),
      minutes: b.minutes,
      day: b.dayKey,
      summary: `[Jarvis] ${course}${t.title}`,
      description:
        `Deadline: ${dl}\nSisa effort sebelum blok ini: ±${remainingMinutes(t)} menit\n\n` +
        'Dibuat otomatis oleh Jarvis Akademik. Jangan edit manual — ubah lewat Telegram.',
    };
  });

  const perDayMap = {};
  for (const b of out) {
    perDayMap[b.day] = perDayMap[b.day] || { day: b.day, minutes: 0, blocks: 0 };
    perDayMap[b.day].minutes += b.minutes;
    perDayMap[b.day].blocks += 1;
  }
  const perDay = Object.values(perDayMap).sort((a, b) => (a.day < b.day ? -1 : 1));
  const totalNeed = queue.reduce((s, q) => s + q.need, 0);
  const totalScheduled = out.reduce((s, b) => s + b.minutes, 0);
  const heavyDays = perDay.filter((d) => d.minutes >= cfg.maxDaily * 0.9).map((d) => d.day);

  return {
    blocks: out,
    infeasible,
    overdue,
    perDay,
    stats: { tasks_considered: queue.length, total_need_minutes: totalNeed, total_scheduled_minutes: totalScheduled, heavy_days: heavyDays },
    config: cfg,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCHED_DEFAULTS, readConfig, gcalEventsToBusy, mergeIntervals, buildFreeSlots, remainingMinutes, scheduleTasks,
  };
}
