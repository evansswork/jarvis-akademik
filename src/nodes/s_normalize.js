// @lib normalize.js
// Gabungkan task Lentera + Classroom jadi satu daftar untuk di-upsert.
const lentera = $('S: Parse Lentera').first().json;
const courses = $('S: Pecah kelas').all().map((x) => x.json);
const works = $('S: Classroom tugas').all().map((x) => x.json);
const subs = $input.all().map((x) => x.json);
const warnings = [];
if (lentera.lentera_warning) warnings.push(lentera.lentera_warning);
const realCourses = courses.filter((c) => c.id);
if (realCourses.length === 0) {
  warnings.push(courses[0] && courses[0].classroom_error
    ? `Classroom gagal diambil: ${courses[0].classroom_error}`
    : 'Tidak ada kelas Classroom aktif yang relevan.');
}
const settings = $('S: Muat setting').first().json.settings || {};
const ignored = (courses[0] && courses[0].ignored) || [];
const classroom = realCourses.length
  ? classroomToTasks(courses, works, subs, { since: parseSemesterStart(settings.semester_start) })
  : [];
const now = new Date();
const all = filterRelevant([...(lentera.lentera_tasks || []), ...classroom], now);
return [{
  json: {
    tasks_json: JSON.stringify(all),
    // nama kelas yang dilewati: tugas lama dari kelas ini yang masih "open"
    // di database akan ditandai dropped oleh query sinkron.
    ignored_courses_json: JSON.stringify(ignored.map((c) => c.name)),
    kelas_dilewati: ignored,
    sources: { lentera: (lentera.lentera_tasks || []).length, classroom: classroom.length, dikirim: all.length },
    warnings,
  },
}];
