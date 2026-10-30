// @lib time.js scheduler.js
// Inti replanning: kumpulkan waktu sibuk, jalankan penjadwal deterministik.
const data = $('R: Muat data').first().json;
const settings = data.settings || {};
if (!/@/.test(settings.jarvis_calendar_id || '') || /^xxxx@/.test(settings.jarvis_calendar_id)) {
  throw new Error('jarvis_calendar_id belum diisi di tabel settings.');
}
const cfg = readConfig(settings);
const now = new Date();

const mainEvents = $('R: Event kalender utama').all().map((x) => x.json).filter((e) => e && e.id);
const jarvisEvents = $input.all().map((x) => x.json).filter((e) => e && e.id);

// Waktu sibuk = acara kalender utama + periode tidak tersedia + blok Jarvis
// yang sedang berjalan (tidak dihapus).
const busy = gcalEventsToBusy(mainEvents, cfg);
for (const u of data.unavailable || []) {
  busy.push({ start: new Date(u.start), end: new Date(u.end), label: u.label });
}
const toDelete = [];
for (const e of jarvisEvents) {
  const s = new Date((e.start && (e.start.dateTime || e.start.date)) || 0);
  const en = new Date((e.end && (e.end.dateTime || e.end.date)) || 0);
  if (s >= now) toDelete.push(e.id);
  else if (en > now) busy.push({ start: s, end: en, label: 'blok Jarvis berjalan' });
}

const result = scheduleTasks({ now, tasks: data.tasks || [], busy, settings });
delete result.config;
return [{
  json: {
    ...result,
    now: now.toISOString(),
    to_delete: toDelete,
    busy_count: busy.length,
    jarvis_calendar_id: settings.jarvis_calendar_id,
  },
}];
