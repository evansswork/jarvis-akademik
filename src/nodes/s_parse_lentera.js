// @lib time.js ical.js normalize.js
// Parse export kalender Lentera (Moodle). Kalau gagal/belum diatur, lanjut
// tanpa Lentera dan catat peringatannya.
const res = $input.first().json || {};
const body = typeof res.data === 'string' ? res.data : '';
let tasks = [];
let warning = null;
if (body.includes('BEGIN:VCALENDAR')) {
  const events = parseICS(body, 420);
  tasks = lenteraToTasks(events);
} else if (res.error) {
  warning = `Lentera gagal diambil: ${typeof res.error === 'string' ? res.error : (res.error.message || 'error')}`;
} else {
  warning = 'Respons Lentera bukan file kalender (cek userid & token).';
}
return [{ json: { lentera_tasks: tasks, lentera_warning: warning } }];
