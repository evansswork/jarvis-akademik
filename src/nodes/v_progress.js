// @lib validate.js
const i = $input.first().json;
const id = vInt(i.task_id, 'task_id', 1, 1e12);
if (!id) throw new Error('task_id wajib diisi (lihat dari lihat_tugas atau lihat_jadwal)');
return [{
  json: {
    task_id: id,
    minutes_done: vInt(i.minutes_done, 'minutes_done', 0, 1440) ?? 0,
    finished: vBool(i.finished),
    note: vStr(i.note),
  },
}];
