// @lib validate.js
const i = $input.first().json;
const title = vStr(i.title);
if (!title) throw new Error('title wajib diisi');
const types = ['tugas', 'kuis', 'lab', 'ujian', 'bacaan', 'lainnya'];
let taskType = vStr(i.task_type).toLowerCase();
if (!types.includes(taskType)) taskType = 'tugas';
const task = {
  course: vStr(i.course) || null,
  title,
  task_type: taskType,
  deadline: vIso(i.deadline, 'deadline') || null,
  effort_minutes: vInt(i.effort_minutes, 'effort_minutes', 5, 6000) ?? 90,
  weight: vInt(i.weight, 'weight', 1, 3) ?? 2,
  notes: vStr(i.note) || null,
};
return [{ json: { task_json: JSON.stringify(task) } }];
