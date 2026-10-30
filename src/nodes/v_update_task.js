// @lib validate.js
const i = $input.first().json;
const id = vInt(i.task_id, 'task_id', 1, 1e12);
if (!id) throw new Error('task_id wajib diisi (lihat dari lihat_tugas)');
const statusMap = { open: 'open', aktif: 'open', done: 'done', selesai: 'done', dropped: 'dropped', batal: 'dropped', drop: 'dropped' };
const changes = {};
if (vStr(i.title)) changes.title = vStr(i.title);
if (vStr(i.course)) changes.course = vStr(i.course);
if (vStr(i.task_type)) {
  const t = vStr(i.task_type).toLowerCase();
  if (!['tugas', 'kuis', 'lab', 'ujian', 'bacaan', 'lainnya'].includes(t)) throw new Error(`task_type "${t}" tidak dikenal`);
  changes.task_type = t;
}
if (vStr(i.deadline)) changes.deadline = vIso(i.deadline, 'deadline');
const effort = vInt(i.effort_minutes, 'effort_minutes', 5, 6000);
if (effort !== null) changes.effort_minutes = effort;
const weight = vInt(i.weight, 'weight', 1, 3);
if (weight !== null) changes.weight = weight;
const target = vInt(i.target_pct, 'target_pct', 0, 100);
if (target !== null) changes.target_pct = target;
if (vStr(i.status)) {
  const st = statusMap[vStr(i.status).toLowerCase()];
  if (!st) throw new Error(`status "${i.status}" tidak dikenal. Pakai open, done, atau dropped`);
  changes.status = st;
}
if (vStr(i.note)) changes.notes = vStr(i.note);
if (Object.keys(changes).length === 0) throw new Error('Tidak ada field yang diubah');
return [{ json: { task_id: id, changes_json: JSON.stringify(changes) } }];
