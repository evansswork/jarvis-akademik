// ---------------------------------------------------------------------------
// lib/normalize.js — ubah data mentah Lentera & Classroom jadi "task" seragam:
// { source, source_id, course, title, task_type, deadline (ISO UTC|null),
//   effort_minutes, weight (1-3), status ('open'|'done') }
// Estimasi effort di sini hanya tebakan awal (heuristik). User bisa
// mengoreksinya lewat chat, dan agent menyimpannya ke database.
// ---------------------------------------------------------------------------

/** Tebak jenis, effort (menit), dan bobot dari judul tugas. */
function guessTaskMeta(title, hint) {
  const t = `${title || ''} ${hint || ''}`.toLowerCase();
  if (/\b(uts|uas|ujian|exam|midterm|final test)\b/.test(t)) return { task_type: 'ujian', effort_minutes: 360, weight: 3 };
  if (/knowledge check/.test(t)) return { task_type: 'kuis', effort_minutes: 30, weight: 1 };
  if (/\b(quiz|kuis)/.test(t)) return { task_type: 'kuis', effort_minutes: 45, weight: 2 };
  if (/\b(lab|praktikum)\b/.test(t)) return { task_type: 'lab', effort_minutes: 120, weight: 2 };
  if (/\b(project|proyek|laporan|report|makalah|paper)\b/.test(t)) return { task_type: 'tugas', effort_minutes: 240, weight: 3 };
  if (/\b(assessment|tugas|assignment|homework|pr)\b/.test(t)) return { task_type: 'tugas', effort_minutes: 120, weight: 2 };
  return { task_type: 'tugas', effort_minutes: 90, weight: 2 };
}

// Moodle membuat beberapa event untuk satu aktivitas, mis. "Quiz07 ... opens",
// "... closes", "... should be completed", "... is due". Kita gabungkan per
// aktivitas dan ambil deadline yang paling relevan.
const MOODLE_SUFFIXES = [
  { re: /\s+closes$/i, kind: 'close', rank: 1 },
  { re: /\s+is due$/i, kind: 'due', rank: 1 },
  { re: /\s+due$/i, kind: 'due', rank: 1 },
  { re: /\s+should be completed$/i, kind: 'complete', rank: 2 },
  { re: /\s+opens$/i, kind: 'open', rank: 9 },
];

function splitMoodleSummary(summary) {
  const s = String(summary || '').replace(/\s+/g, ' ').trim();
  for (const suf of MOODLE_SUFFIXES) {
    if (suf.re.test(s)) return { base: s.replace(suf.re, '').trim(), kind: suf.kind, rank: suf.rank };
  }
  return { base: s, kind: 'event', rank: 3 };
}

/**
 * Event Lentera -> task. Satu task per (kode matkul, nama aktivitas).
 * Event "opens" diabaikan. Deadline = event dengan rank terkecil (closes/due),
 * jika sama rank ambil yang paling akhir.
 */
function lenteraToTasks(events) {
  const groups = new Map();
  for (const ev of events || []) {
    if (!ev || !ev.summary || !ev.start) continue;
    const { base, kind, rank } = splitMoodleSummary(ev.summary);
    if (kind === 'open') continue;
    const course = (ev.categories || '').trim() || 'Lentera';
    const key = `${course}::${base}`;
    const prev = groups.get(key);
    if (!prev || rank < prev.rank || (rank === prev.rank && ev.start > prev.start)) {
      groups.set(key, { key, course, base, rank, start: ev.start, description: ev.description || '' });
    }
  }
  const tasks = [];
  for (const g of groups.values()) {
    const meta = guessTaskMeta(g.base, g.description);
    tasks.push({
      source: 'lentera',
      source_id: g.key,
      course: g.course,
      title: g.base,
      task_type: meta.task_type,
      deadline: g.start.toISOString(),
      effort_minutes: meta.effort_minutes,
      weight: meta.weight,
      status: 'open',
    });
  }
  return tasks;
}

/** dueDate {year,month,day} + dueTime {hours,minutes} (UTC) -> Date | null */
function classroomDue(work) {
  const d = work && work.dueDate;
  if (!d || !d.year) return null;
  const t = work.dueTime || {};
  // Classroom: jika dueTime kosong, deadline = akhir hari (23:59 UTC tidak tepat
  // untuk WIB, jadi pakai 23:59 lokal = 16:59 UTC).
  if (t.hours === undefined && t.minutes === undefined) {
    return new Date(Date.UTC(d.year, d.month - 1, d.day, 16, 59));
  }
  return new Date(Date.UTC(d.year, d.month - 1, d.day, t.hours || 0, t.minutes || 0));
}

const DONE_STATES = ['TURNED_IN', 'RETURNED'];

/**
 * Pisahkan kelas Classroom yang masih relevan dari kelas semester lalu yang
 * belum di-archive dosen.
 *  - since:  kelas yang DIBUAT sebelum tanggal ini dianggap kelas lama.
 *  - ignore: daftar kata kunci (nama kelas atau id) yang diabaikan user.
 */
function filterCourses(courses, { since = null, ignore = [] } = {}) {
  const keys = (ignore || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
  const kept = [];
  const ignored = [];
  for (const c of courses || []) {
    if (!c || !c.id) continue;
    const name = String(c.name || '').toLowerCase();
    const byKeyword = keys.some((k) => name.includes(k) || String(c.id) === k);
    const created = c.creationTime ? new Date(c.creationTime) : null;
    const byDate = since && created && created < since;
    if (byKeyword || byDate) ignored.push({ id: c.id, name: c.name || c.id, reason: byKeyword ? 'diabaikan user' : 'kelas semester lalu' });
    else kept.push(c);
  }
  return { kept, ignored };
}

/** "Basis Data, jarkom" -> ['Basis Data', 'jarkom'] */
function parseIgnoreList(text) {
  return String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** "2026-08-01" -> Date 00:00 WIB, atau null kalau kosong/tidak valid. */
function parseSemesterStart(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - 7 * 3600e3) : null;
}

/**
 * courses: [{id, name}], workByCourse: [{courseWork:[...]}] (sejajar dengan
 * courses), subsByCourse: [{studentSubmissions:[...]}] (sejajar).
 * opts.since: tugas TANPA deadline yang dibuat sebelum tanggal ini dilewati
 * (sisa semester lalu yang tidak akan pernah "lewat deadline").
 */
function classroomToTasks(courses, workByCourse, subsByCourse, opts = {}) {
  const tasks = [];
  (courses || []).forEach((course, i) => {
    if (!course || !course.id) return;
    const works = ((workByCourse || [])[i] || {}).courseWork || [];
    const subs = ((subsByCourse || [])[i] || {}).studentSubmissions || [];
    const stateByWork = new Map(subs.map((s) => [s.courseWorkId, s.state]));
    for (const w of works) {
      if (w.state && w.state !== 'PUBLISHED') continue;
      const due = classroomDue(w);
      if (!due && opts.since && w.creationTime && new Date(w.creationTime) < opts.since) continue;
      const meta = guessTaskMeta(w.title, w.workType);
      if (w.workType === 'MULTIPLE_CHOICE_QUESTION' || w.workType === 'SHORT_ANSWER_QUESTION') {
        meta.effort_minutes = Math.min(meta.effort_minutes, 30);
      }
      const subState = stateByWork.get(w.id);
      tasks.push({
        source: 'classroom',
        source_id: String(w.id),
        course: course.name || course.id,
        title: w.title || '(tanpa judul)',
        task_type: meta.task_type,
        deadline: due ? due.toISOString() : null,
        effort_minutes: meta.effort_minutes,
        weight: meta.weight,
        status: DONE_STATES.includes(subState) ? 'done' : 'open',
      });
    }
  });
  return tasks;
}

/**
 * Buang task yang tidak perlu di-insert: deadline sudah lewat dan belum
 * pernah tercatat. (Task yang sudah ada tetap di-update lewat SQL.)
 * Task berstatus done tetap dikirim agar status di DB ikut ter-update.
 */
function filterRelevant(tasks, now) {
  return (tasks || []).filter((t) => {
    if (t.status === 'done') return true;
    if (!t.deadline) return true;
    return new Date(t.deadline).getTime() >= now.getTime();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    guessTaskMeta, splitMoodleSummary, lenteraToTasks, classroomDue, classroomToTasks, filterRelevant,
    filterCourses, parseIgnoreList, parseSemesterStart,
  };
}
