const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadLib } = require('./load-lib');

const L = loadLib(['time.js', 'ical.js', 'normalize.js', 'scheduler.js']);
const OFF = 420; // WIB
const wib = (s) => new Date(`${s}+07:00`); // "2026-10-22T09:00:00"

// ---------------------------------------------------------------- iCal -----
test('parseICS: membaca sampel Lentera, termasuk judul yang terlipat', () => {
  const ics = fs.readFileSync(path.join(__dirname, 'fixtures', 'lentera_sample.ics'), 'utf8');
  const evs = L.parseICS(ics, OFF);
  assert.equal(evs.length, 10);
  const q7 = evs.find((e) => e.uid.startsWith('87085'));
  assert.equal(q7.summary, 'Quiz07 - Consistency and Replication in DS [LO-1.7] should be completed');
  assert.equal(q7.categories, 'TF4507-C-1/2026');
  assert.equal(q7.start.toISOString(), '2026-10-20T00:00:00.000Z');
  const lab = evs.find((e) => e.uid.startsWith('83764'));
  assert.equal(lab.summary, 'ACD Lab 7.1 - Creating Lambda Functions Using the AWS SDK for Python');
});

test('icsParseDate: UTC, tanggal saja, dan jam lokal', () => {
  assert.equal(L.icsParseDate('20261018T170000Z', {}, OFF).toISOString(), '2026-10-18T17:00:00.000Z');
  assert.equal(L.icsParseDate('20261020', {}, OFF).toISOString(), '2026-10-19T17:00:00.000Z');
  assert.equal(L.icsParseDate('20261020T090000', {}, OFF).toISOString(), '2026-10-20T02:00:00.000Z');
});

// ------------------------------------------------------------- Lentera -----
test('lenteraToTasks: gabung "should be completed" + "closes", abaikan "opens"', () => {
  const ics = fs.readFileSync(path.join(__dirname, 'fixtures', 'lentera_sample.ics'), 'utf8');
  const tasks = L.lenteraToTasks(L.parseICS(ics, OFF));
  const q7 = tasks.filter((t) => t.title.startsWith('Quiz07'));
  assert.equal(q7.length, 1, 'Quiz07 harus jadi satu task');
  assert.equal(q7[0].deadline, '2026-10-22T16:59:00.000Z', 'deadline diambil dari event "closes"');
  assert.equal(q7[0].task_type, 'kuis');
  const q8 = tasks.filter((t) => t.title.startsWith('Quiz08'));
  assert.equal(q8.length, 1);
  assert.equal(q8[0].deadline, '2026-10-29T16:59:00.000Z');
  const kc = tasks.find((t) => /Knowledge Check/.test(t.title));
  assert.equal(kc.effort_minutes, 30);
  assert.equal(kc.course, 'TF4509-A-1/2026');
  assert.ok(tasks.every((t) => t.source === 'lentera' && t.source_id.includes('::')));
});

test('filterRelevant: buang task baru yang deadline-nya sudah lewat', () => {
  const ics = fs.readFileSync(path.join(__dirname, 'fixtures', 'lentera_sample.ics'), 'utf8');
  const tasks = L.filterRelevant(L.lenteraToTasks(L.parseICS(ics, OFF)), wib('2026-10-22T08:00:00'));
  const titles = JSON.parse(JSON.stringify(tasks.map((t) => t.title).sort()));
  assert.deepEqual(titles, [
    'ACD Lab 6.1 - Developing REST APIs with API Gateway',
    'ACD Lab 7.1 - Creating Lambda Functions Using the AWS SDK for Python',
    'ACD Module 6 Knowledge Check',
    'Quiz07 - Consistency and Replication in DS [LO-1.7]',
    'Quiz08 - Fault Tolerance [LO-1.8]',
  ]);
});

// ----------------------------------------------------------- Classroom -----
test('classroomToTasks: status pengumpulan & dueDate', () => {
  const courses = [{ id: 'c1', name: 'Basis Data' }, { id: 'c2', name: 'Jarkom' }];
  const work = [
    { courseWork: [
      { id: 'w1', title: 'Laporan Normalisasi', state: 'PUBLISHED', workType: 'ASSIGNMENT', dueDate: { year: 2026, month: 10, day: 24 }, dueTime: { hours: 16, minutes: 59 } },
      { id: 'w2', title: 'Tugas ERD', state: 'PUBLISHED', workType: 'ASSIGNMENT', dueDate: { year: 2026, month: 10, day: 20 }, dueTime: { hours: 5 } },
      { id: 'w3', title: 'Draft', state: 'DRAFT' },
    ] },
    {},
  ];
  const subs = [{ studentSubmissions: [{ courseWorkId: 'w2', state: 'TURNED_IN' }, { courseWorkId: 'w1', state: 'CREATED' }] }, {}];
  const tasks = L.classroomToTasks(courses, work, subs);
  assert.equal(tasks.length, 2);
  const w1 = tasks.find((t) => t.source_id === 'w1');
  assert.equal(w1.status, 'open');
  assert.equal(w1.course, 'Basis Data');
  assert.equal(w1.deadline, '2026-10-24T16:59:00.000Z');
  assert.equal(w1.effort_minutes, 240, 'laporan = 240 menit');
  assert.equal(tasks.find((t) => t.source_id === 'w2').status, 'done');
});

test('filterCourses: kelas semester lalu & kelas yang diabaikan dilewati', () => {
  const since = L.parseSemesterStart('2026-08-01');
  assert.equal(since.toISOString(), '2026-07-31T17:00:00.000Z');
  const courses = [
    { id: '1', name: 'Basis Data', creationTime: '2026-02-03T01:00:00Z' },
    { id: '2', name: 'Sistem Terdistribusi', creationTime: '2026-08-20T01:00:00Z' },
    { id: '3', name: 'Paduan Suara', creationTime: '2026-08-21T01:00:00Z' },
    { id: '4', name: 'Tanpa tanggal' },
  ];
  const r = L.filterCourses(courses, { since, ignore: L.parseIgnoreList('paduan suara, ') });
  assert.deepEqual(JSON.parse(JSON.stringify(r.kept.map((c) => c.id))), ['2', '4']);
  assert.deepEqual(JSON.parse(JSON.stringify(r.ignored.map((c) => [c.id, c.reason]))), [['1', 'kelas semester lalu'], ['3', 'diabaikan user']]);
  assert.equal(L.filterCourses(courses, {}).kept.length, 4, 'tanpa setting: semua kelas dipakai');
  assert.equal(L.parseSemesterStart(''), null);
});

test('classroomToTasks: tugas tanpa deadline dari sebelum semester dilewati', () => {
  const since = L.parseSemesterStart('2026-08-01');
  const work = [{ courseWork: [
    { id: 'a', title: 'Bacaan lama', state: 'PUBLISHED', creationTime: '2026-03-01T00:00:00Z' },
    { id: 'b', title: 'Bacaan baru', state: 'PUBLISHED', creationTime: '2026-09-01T00:00:00Z' },
  ] }];
  const t = L.classroomToTasks([{ id: 'c', name: 'X' }], work, [{}], { since });
  assert.deepEqual(JSON.parse(JSON.stringify(t.map((x) => x.source_id))), ['b']);
});

test('classroomDue: tanpa dueTime -> 23:59 WIB', () => {
  assert.equal(L.classroomDue({ dueDate: { year: 2026, month: 11, day: 1 } }).toISOString(), '2026-11-01T16:59:00.000Z');
  assert.equal(L.classroomDue({}), null);
});

// ----------------------------------------------------------- Scheduler -----
const BASE_SETTINGS = {
  study_start: '08:00', study_end: '22:00', max_daily_minutes: '300', max_task_minutes_per_day: '120',
  block_max_minutes: '90', block_min_minutes: '30', break_minutes: '15', horizon_days: '7',
  deadline_buffer_minutes: '120', tz_offset_minutes: '420',
};

function overlaps(a, b) {
  return new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);
}

function checkInvariants(res, busy, tasks, settings) {
  const cfg = L.readConfig(settings);
  for (const b of res.blocks) {
    // tidak bentrok dengan waktu sibuk
    for (const x of busy) assert.ok(!overlaps(b, x), `blok ${b.start_local} bentrok dengan ${x.label || 'busy'}`);
    // di dalam jam belajar
    const s = L.localParts(new Date(b.start), cfg.offset);
    const e = L.localParts(new Date(b.end), cfg.offset);
    assert.ok(s.hh * 60 + s.mm >= cfg.studyStart, `mulai sebelum jam belajar: ${b.start_local}`);
    assert.ok(e.hh * 60 + e.mm <= cfg.studyEnd || (e.hh === 0 && e.mm === 0 && cfg.studyEnd === 1440), `selesai lewat jam belajar: ${b.end_local}`);
    // sebelum deadline
    const t = tasks.find((x) => x.id === b.task_id);
    if (t.deadline) assert.ok(new Date(b.end) <= new Date(t.deadline), `blok ${b.title} lewat deadline`);
    assert.ok(b.minutes >= Math.min(cfg.blockMin, 5) && b.minutes <= cfg.blockMax);
  }
  // blok tidak saling bentrok
  for (let i = 0; i < res.blocks.length; i++) {
    for (let j = i + 1; j < res.blocks.length; j++) {
      assert.ok(!overlaps(res.blocks[i], res.blocks[j]), 'dua blok Jarvis bentrok');
    }
  }
  // batas harian
  for (const d of res.perDay) assert.ok(d.minutes <= cfg.maxDaily, `hari ${d.day} melebihi batas`);
}

test('scheduler: jadwal valid, tidak bentrok dengan kuliah', () => {
  const now = wib('2026-10-22T07:00:00');
  const busy = [
    { start: wib('2026-10-22T09:00:00'), end: wib('2026-10-22T11:30:00'), label: 'Kuliah Basis Data' },
    { start: wib('2026-10-22T13:00:00'), end: wib('2026-10-22T15:30:00'), label: 'Kuliah Jarkom' },
    { start: wib('2026-10-23T08:00:00'), end: wib('2026-10-23T12:00:00'), label: 'Kuliah' },
  ];
  const tasks = [
    { id: 1, title: 'Laporan Jarkom', course: 'Jarkom', deadline: wib('2026-10-23T23:59:00').toISOString(), effort_minutes: 300, done_minutes: 0, weight: 3, target_pct: 100, status: 'open' },
    { id: 2, title: 'Quiz07', course: 'SisTer', deadline: wib('2026-10-22T23:59:00').toISOString(), effort_minutes: 45, done_minutes: 0, weight: 2, target_pct: 100, status: 'open' },
    { id: 3, title: 'Statistik Bab 3', course: 'Statistik', deadline: null, effort_minutes: 120, done_minutes: 30, weight: 2, target_pct: 100, status: 'open' },
  ];
  const res = L.scheduleTasks({ now, tasks, busy, settings: BASE_SETTINGS });
  checkInvariants(res, busy, tasks, BASE_SETTINGS);
  assert.equal(res.infeasible.length, 0, JSON.stringify(res.infeasible));
  const mins = (id) => res.blocks.filter((b) => b.task_id === id).reduce((s, b) => s + b.minutes, 0);
  assert.equal(mins(1), 300);
  assert.equal(mins(2), 45);
  assert.equal(mins(3), 90, 'sisa = 120 - 30');
  // Quiz07 (deadline paling dekat) dijadwalkan paling awal
  assert.equal(res.blocks[0].task_id, 2);
  assert.equal(res.blocks[0].start_local, '2026-10-22T08:00:00+07:00');
});

test('scheduler: sakit 3 hari -> semua blok pindah, sisanya dilaporkan tidak muat', () => {
  const now = wib('2026-10-22T07:00:00');
  const sick = [{ start: wib('2026-10-22T00:00:00'), end: wib('2026-10-25T00:00:00'), label: 'Sakit' }];
  const tasks = [
    { id: 1, title: 'Laporan Jarkom', deadline: wib('2026-10-25T23:59:00').toISOString(), effort_minutes: 600, done_minutes: 0, weight: 3, target_pct: 100, status: 'open' },
    { id: 2, title: 'Knowledge Check', deadline: wib('2026-10-26T00:00:00').toISOString(), effort_minutes: 30, done_minutes: 0, weight: 1, target_pct: 100, status: 'open' },
  ];
  const res = L.scheduleTasks({ now, tasks, busy: sick, settings: BASE_SETTINGS });
  checkInvariants(res, sick, tasks, BASE_SETTINGS);
  assert.ok(res.blocks.every((b) => b.day >= '2026-10-25'), 'tidak ada blok di hari sakit');
  const lap = res.infeasible.find((x) => x.task_id === 1);
  assert.ok(lap, 'laporan 10 jam tidak muat di 1 hari');
  assert.equal(lap.scheduled_minutes, 300, 'batas per tugas dilepas, tapi batas harian 300 tetap');
  assert.equal(lap.feasible_pct, 50);
  // Knowledge Check tidak kebagian hari 25 (sudah penuh), masuk 26 00:00? tidak: deadline 26 00:00
  // -> due 25 22:00, jadi ikut tidak muat juga.
  assert.ok(res.infeasible.find((x) => x.task_id === 2));
});

test('scheduler: target_pct diturunkan agent -> kebutuhan menyusut', () => {
  const now = wib('2026-10-22T07:00:00');
  const t = [{ id: 9, title: 'Tugas besar', deadline: wib('2026-10-30T23:59:00').toISOString(), effort_minutes: 600, done_minutes: 0, weight: 1, target_pct: 50, status: 'open' }];
  const res = L.scheduleTasks({ now, tasks: t, busy: [], settings: BASE_SETTINGS });
  assert.equal(res.blocks.reduce((s, b) => s + b.minutes, 0), 300);
});

test('scheduler: tugas lewat deadline masuk daftar overdue, tidak dijadwalkan', () => {
  const now = wib('2026-10-22T07:00:00');
  const t = [{ id: 5, title: 'Telat', deadline: wib('2026-10-21T23:59:00').toISOString(), effort_minutes: 60, done_minutes: 0, weight: 2, target_pct: 100, status: 'open' }];
  const res = L.scheduleTasks({ now, tasks: t, busy: [], settings: BASE_SETTINGS });
  assert.equal(res.blocks.length, 0);
  assert.equal(res.overdue.length, 1);
});

test('scheduler: hari istirahat (rest_days) dikosongkan', () => {
  const now = wib('2026-10-24T07:00:00'); // Sabtu
  const t = [{ id: 1, title: 'X', deadline: null, effort_minutes: 400, done_minutes: 0, weight: 2, target_pct: 100, status: 'open' }];
  const res = L.scheduleTasks({ now, tasks: t, busy: [], settings: { ...BASE_SETTINGS, rest_days: '0' } });
  assert.ok(res.blocks.every((b) => b.day !== '2026-10-25'), 'tidak ada blok hari Minggu');
});

test('gcalEventsToBusy: abaikan all-day, transparent, dan event 0 menit', () => {
  const cfg = L.readConfig(BASE_SETTINGS);
  const evs = [
    { summary: 'Kuliah', start: { dateTime: '2026-10-22T09:00:00+07:00' }, end: { dateTime: '2026-10-22T11:00:00+07:00' } },
    { summary: 'Libur', start: { date: '2026-10-23' }, end: { date: '2026-10-24' } },
    { summary: 'Info', transparency: 'transparent', start: { dateTime: '2026-10-22T12:00:00+07:00' }, end: { dateTime: '2026-10-22T13:00:00+07:00' } },
    { summary: 'Deadline Lentera', start: { dateTime: '2026-10-22T17:00:00Z' }, end: { dateTime: '2026-10-22T17:00:00Z' } },
    { summary: 'Batal', status: 'cancelled', start: { dateTime: '2026-10-22T14:00:00+07:00' }, end: { dateTime: '2026-10-22T15:00:00+07:00' } },
  ];
  const busy = L.gcalEventsToBusy(evs, cfg);
  assert.equal(busy.length, 1);
  assert.equal(busy[0].label, 'Kuliah');
});

test('scheduler: stress acak — invariant selalu terpenuhi', () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let run = 0; run < 200; run++) {
    const now = new Date(wib('2026-10-22T06:00:00').getTime() + Math.floor(rnd() * 72) * 3600e3 + Math.floor(rnd() * 60) * 60e3);
    const busy = [];
    for (let i = 0; i < 12; i++) {
      const s = new Date(now.getTime() + Math.floor(rnd() * 7 * 24) * 3600e3 + Math.floor(rnd() * 4) * 15 * 60e3);
      busy.push({ start: s, end: new Date(s.getTime() + (1 + Math.floor(rnd() * 4)) * 45 * 60e3), label: `busy${i}` });
    }
    const tasks = [];
    for (let i = 1; i <= 8; i++) {
      const dl = rnd() < 0.15 ? null : new Date(now.getTime() + (2 + Math.floor(rnd() * 160)) * 3600e3).toISOString();
      tasks.push({ id: i, title: `T${i}`, deadline: dl, effort_minutes: 15 + Math.floor(rnd() * 20) * 15, done_minutes: 0, weight: 1 + Math.floor(rnd() * 3), target_pct: 100, status: 'open' });
    }
    const settings = { ...BASE_SETTINGS, study_start: rnd() < 0.5 ? '07:30' : '09:00', study_end: rnd() < 0.5 ? '21:00' : '23:00' };
    const res = L.scheduleTasks({ now, tasks, busy, settings });
    checkInvariants(res, busy, tasks, settings);
    // setiap tugas: terjadwal penuh ATAU tercatat di infeasible
    for (const t of tasks) {
      const got = res.blocks.filter((b) => b.task_id === t.id).reduce((s, b) => s + b.minutes, 0);
      const inf = res.infeasible.find((x) => x.task_id === t.id);
      assert.ok(got === t.effort_minutes || (inf && inf.scheduled_minutes === got), `T${t.id}: ${got}/${t.effort_minutes}`);
    }
  }
});

test('time helpers', () => {
  assert.equal(L.isoLocal(new Date('2026-10-22T02:00:00Z'), OFF), '2026-10-22T09:00:00+07:00');
  assert.equal(L.fmtLocal(new Date('2026-10-22T02:00:00Z'), OFF), 'Kam 22 Okt 09:00');
  assert.equal(L.localDateKey(new Date('2026-10-22T17:30:00Z'), OFF), '2026-10-23');
});
