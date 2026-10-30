// Pasangkan blok dengan event Google Calendar yang berhasil dibuat.
const blocks = $('R: Daftar blok baru').all().map((x) => x.json).filter((b) => b.start);
const created = $input.all().map((x) => x.json);
const rows = [];
let failed = 0;
blocks.forEach((b, i) => {
  const ev = created[i] || {};
  if (!ev.id) {
    failed += 1;
    return;
  }
  rows.push({ task_id: b.task_id, start_at: b.start, end_at: b.end, gcal_event_id: ev.id });
});
const deleted = $('R: Hapus blok lama').all().filter((x) => x.json && !x.json.error).length;
return [{ json: { rows_json: JSON.stringify(rows), created_count: rows.length, failed_count: failed, deleted_events: deleted } }];
