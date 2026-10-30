// @lib validate.js
// Hanya pengaturan jadwal yang boleh diubah lewat chat.
const i = $input.first().json;
const key = vStr(i.key);
let value = vStr(i.value);
// Awalan "+" = tambahkan ke daftar yang ada (khusus classroom_ignore).
const append = key === 'classroom_ignore' && value.startsWith('+');
if (append) value = value.slice(1).trim();
const rules = {
  study_start: /^([01]?\d|2[0-3]):[0-5]\d$/,
  study_end: /^([01]?\d|2[0-3]):[0-5]\d$/,
  max_daily_minutes: /^\d{2,4}$/,
  max_task_minutes_per_day: /^\d{2,4}$/,
  block_max_minutes: /^\d{2,3}$/,
  block_min_minutes: /^\d{2,3}$/,
  break_minutes: /^\d{1,3}$/,
  deadline_buffer_minutes: /^\d{1,4}$/,
  horizon_days: /^\d{1,2}$/,
  rest_days: /^$|^[0-6](,[0-6])*$/,
  semester_start: /^$|^\d{4}-\d{2}-\d{2}$/,
  classroom_ignore: /^[^;]{0,500}$/,
};
if (!rules[key]) throw new Error(`Pengaturan "${key}" tidak boleh diubah. Yang boleh: ${Object.keys(rules).join(', ')}`);
if (!rules[key].test(value)) throw new Error(`Nilai "${value}" tidak valid untuk ${key}`);
return [{ json: { key, value, append } }];
