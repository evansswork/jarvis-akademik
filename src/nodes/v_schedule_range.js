// @lib time.js validate.js
// Default: hari ini 00:00 sampai lusa 00:00 (WIB).
const i = $input.first().json;
const now = new Date();
const day0 = startOfLocalDay(now, 420);
const start = vIso(i.start, 'start') || day0.toISOString();
const end = vIso(i.end, 'end') || new Date(day0.getTime() + 2 * MS_DAY).toISOString();
if (new Date(end) <= new Date(start)) throw new Error('end harus setelah start');
return [{ json: { start, end } }];
