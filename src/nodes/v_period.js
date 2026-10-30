// @lib validate.js
const i = $input.first().json;
const start = vIso(i.start, 'start');
const end = vIso(i.end, 'end');
if (!start || !end) throw new Error('start dan end wajib diisi (ISO 8601, +07:00)');
if (new Date(end) <= new Date(start)) throw new Error('end harus setelah start');
if (new Date(end) - new Date(start) > 60 * 24 * 3600e3) throw new Error('Rentang maksimal 60 hari');
return [{ json: { start, end, reason: vStr(i.note) } }];
