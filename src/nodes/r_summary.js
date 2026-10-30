// @lib time.js
// Ringkasan hasil susun ulang untuk agent (dan pesan pagi).
const res = $('R: Penjadwal').first().json;
const col = $('R: Kumpulkan event').first().json;
const data = $('R: Muat data').first().json;
const off = Number((data.settings || {}).tz_offset_minutes || 420);
const now = new Date();
const todayKey = localDateKey(now, off);
const tomorrowKey = localDateKey(new Date(now.getTime() + MS_DAY), off);
const keyToDate = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return localToDate(y, m, d, 12, 0, off);
};
const line = (b) => `${fmtClock(new Date(b.start), off)}-${fmtClock(new Date(b.end), off)} ${b.course ? `${b.course}: ` : ''}${b.title}`;
const fmtDl = (iso) => (iso ? fmtLocal(new Date(iso), off) : 'tanpa deadline');

let sync = null;
if ($('S: Simpan tugas').isExecuted) {
  const s = $('S: Simpan tugas').first().json;
  const n = $('S: Gabung & normalisasi').first().json;
  sync = {
    tugas_baru: s.new_tasks || [],
    diperbarui: Number(s.updated_count || 0),
    ditandai_selesai_dari_classroom: Number(s.marked_done_count || 0),
    kuis_lentera_kedaluwarsa: Number(s.expired_count || 0),
    tugas_kelas_lama_dibuang: Number(s.dropped_from_old_courses_count || 0),
    kelas_dilewati: (n.kelas_dilewati || []).map((c) => c.name),
    sumber: n.sources,
    peringatan: n.warnings,
  };
}

const summary = {
  ok: col.failed_count === 0,
  blok_dibuat: col.created_count,
  blok_gagal_dibuat: col.failed_count,
  total_menit_terjadwal: res.stats.total_scheduled_minutes,
  total_menit_dibutuhkan: res.stats.total_need_minutes,
  blok_hari_ini: res.blocks.filter((b) => b.day === todayKey).map(line),
  blok_besok: res.blocks.filter((b) => b.day === tomorrowKey).map(line),
  beban_per_hari: res.perDay.map((d) => ({ hari: fmtLocal(keyToDate(d.day), off, false), menit: d.minutes, blok: d.blocks })),
  hari_padat: res.stats.heavy_days.map((k) => fmtLocal(keyToDate(k), off, false)),
  tidak_muat: res.infeasible.map((x) => ({
    task_id: x.task_id,
    tugas: x.course ? `${x.course}: ${x.title}` : x.title,
    bobot: x.weight,
    deadline: fmtDl(x.deadline),
    butuh_menit: x.needed_minutes,
    terjadwal_menit: x.scheduled_minutes,
    realistis_persen: x.feasible_pct,
  })),
  lewat_deadline: res.overdue.map((x) => ({
    task_id: x.task_id,
    tugas: x.course ? `${x.course}: ${x.title}` : x.title,
    deadline: fmtDl(x.deadline),
    sisa_menit: x.remaining_minutes,
  })),
  sinkronisasi: sync,
  telegram_chat_id: (data.settings || {}).telegram_chat_id || '',
};
return [{ json: summary }];
