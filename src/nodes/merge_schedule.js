// @lib time.js
// Gabungkan blok belajar Jarvis (database) dengan acara di kalender utama.
const off = 420;
const range = $('Rentang jadwal').first().json;
const blocks = $('Ambil blok Jarvis').first().json.blocks || [];
const events = $input.all().map((x) => x.json).filter((e) => e && e.id && e.status !== 'cancelled');
const fmtRange = (s, e) => `${fmtLocal(s, off)}-${fmtClock(e, off)}`;
const acara = events.map((e) => {
  if (e.start && e.start.date) return { waktu: `${e.start.date} (seharian)`, judul: e.summary || '(tanpa judul)' };
  return { waktu: fmtRange(new Date(e.start.dateTime), new Date(e.end.dateTime)), judul: e.summary || '(tanpa judul)' };
});
return [{
  json: {
    rentang: `${fmtLocal(new Date(range.start), off)} s/d ${fmtLocal(new Date(range.end), off)}`,
    blok_belajar_jarvis: blocks.map((b) => ({
      task_id: b.task_id,
      waktu: fmtRange(new Date(b.start_at), new Date(b.end_at)),
      tugas: b.course ? `${b.course}: ${b.title}` : b.title,
      status: b.status,
    })),
    acara_kalender_utama: acara,
  },
}];
