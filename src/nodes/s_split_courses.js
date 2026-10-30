// @lib normalize.js
// Satu item per kelas Classroom yang relevan. Kelas semester lalu (dibuat
// sebelum semester_start) dan kelas di classroom_ignore dilewati, jadi API
// tugasnya tidak dipanggil. Jika Classroom gagal / semua kelas dilewati,
// kirim satu placeholder agar alur tetap jalan.
const settings = $('S: Muat setting').first().json.settings || {};
const res = $input.first().json || {};
const courses = Array.isArray(res.courses) ? res.courses : [];
const { kept, ignored } = filterCourses(courses, {
  since: parseSemesterStart(settings.semester_start),
  ignore: parseIgnoreList(settings.classroom_ignore),
});
if (kept.length === 0) {
  return [{
    json: {
      id: '', name: '', ignored,
      classroom_error: res.error ? (res.error.message || String(res.error)) : null,
    },
  }];
}
return kept.map((c) => ({ json: { id: c.id, name: c.name, ignored, classroom_error: null } }));
