// Test workflow hasil build: struktur, sintaks Code node, dan alur end-to-end
// (Code node asli + SQL asli di Postgres; hanya Google API & Telegram dipalsukan).
//   JARVIS_PG="-h <socketdir> -p 54329 -U postgres -d jarvis_test" node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { WF, byName, runCode, runSql, psql } = require('./harness');

const HAS_PG = Boolean(process.env.JARVIS_PG);

// Versi node yang dipakai harus ada di source n8n (dicek manual dari repo n8n).
const SUPPORTED = {
  'n8n-nodes-base.telegramTrigger': [1.2],
  'n8n-nodes-base.telegram': [1.2],
  'n8n-nodes-base.postgres': [2.5],
  'n8n-nodes-base.if': [2.2],
  'n8n-nodes-base.code': [2],
  'n8n-nodes-base.switch': [3.2],
  'n8n-nodes-base.executeWorkflowTrigger': [1.1],
  'n8n-nodes-base.executeWorkflow': [1.2],
  'n8n-nodes-base.httpRequest': [4.2],
  'n8n-nodes-base.googleCalendar': [1.3],
  'n8n-nodes-base.scheduleTrigger': [1.2],
  'n8n-nodes-base.stickyNote': [1],
  '@n8n/n8n-nodes-langchain.agent': [2],
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': [1],
  '@n8n/n8n-nodes-langchain.memoryPostgresChat': [1.3],
  '@n8n/n8n-nodes-langchain.toolWorkflow': [2.2],
};
const TRIGGERS = ['n8n-nodes-base.telegramTrigger', 'n8n-nodes-base.executeWorkflowTrigger', 'n8n-nodes-base.scheduleTrigger'];

test('struktur: tipe & versi node dikenal, nama unik, koneksi valid', () => {
  const names = new Set();
  for (const n of WF.nodes) {
    assert.ok(SUPPORTED[n.type], `tipe tidak dikenal: ${n.type}`);
    assert.ok(SUPPORTED[n.type].includes(n.typeVersion), `${n.name}: versi ${n.typeVersion}`);
    assert.ok(!names.has(n.name), `nama duplikat ${n.name}`);
    names.add(n.name);
    assert.ok(/^[0-9a-f-]{36}$/.test(n.id));
  }
  const incoming = {};
  for (const [from, types] of Object.entries(WF.connections)) {
    assert.ok(names.has(from), `koneksi dari node tak dikenal ${from}`);
    for (const [type, outs] of Object.entries(types)) {
      for (const out of outs) {
        for (const c of out) {
          assert.ok(names.has(c.node), `koneksi ke node tak dikenal ${c.node}`);
          assert.equal(c.type, type);
          incoming[c.node] = incoming[c.node] || new Set();
          incoming[c.node].add(type);
        }
      }
    }
  }
  for (const n of WF.nodes) {
    if (TRIGGERS.includes(n.type) || n.type === 'n8n-nodes-base.stickyNote') continue;
    const isSub = /lmChat|memory|toolWorkflow/.test(n.type);
    if (isSub) {
      assert.ok((WF.connections[n.name] || {}).ai_languageModel || (WF.connections[n.name] || {}).ai_memory || (WF.connections[n.name] || {}).ai_tool, `${n.name} tidak terhubung ke agent`);
    } else {
      assert.ok(incoming[n.name] && incoming[n.name].has('main'), `${n.name} tidak punya input`);
    }
  }
  // Switch: jumlah output = numberOutputs
  const sw = byName['Pilih aksi'];
  assert.equal(WF.connections['Pilih aksi'].main.length, sw.parameters.numberOutputs);
});

test('struktur: kredensial terpasang di node yang butuh', () => {
  const need = {
    'n8n-nodes-base.telegramTrigger': 'telegramApi',
    'n8n-nodes-base.telegram': 'telegramApi',
    'n8n-nodes-base.postgres': 'postgres',
    'n8n-nodes-base.googleCalendar': 'googleCalendarOAuth2Api',
    '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': 'googlePalmApi',
    '@n8n/n8n-nodes-langchain.memoryPostgresChat': 'postgres',
  };
  for (const n of WF.nodes) {
    if (need[n.type]) assert.ok(n.credentials && n.credentials[need[n.type]], `${n.name} butuh ${need[n.type]}`);
    if (n.type === 'n8n-nodes-base.httpRequest') {
      const key = n.parameters.authentication === 'genericCredentialType' ? n.parameters.genericAuthType : n.parameters.nodeCredentialType;
      assert.ok(n.credentials[key], `${n.name} butuh ${key}`);
    }
  }
  // Tidak ada token/URL rahasia Lentera di workflow.
  assert.ok(!/authtoken=/.test(JSON.stringify(WF)), 'token Lentera bocor ke workflow');
});

test('struktur: setiap tool agent memanggil aksi yang ada di router', () => {
  const actions = JSON.parse(byName['Pilih aksi'].parameters.output.match(/\)\((\[.*?\])\.indexOf/)[1]);
  const tools = WF.nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.toolWorkflow');
  assert.equal(tools.length, 10);
  for (const t of tools) {
    assert.match(t.name, /^[a-z_]+$/, 'nama tool harus snake_case');
    assert.ok(actions.includes(t.parameters.workflowInputs.value.action), `${t.name}: aksi tidak dikenal`);
    for (const [k, v] of Object.entries(t.parameters.workflowInputs.value)) {
      if (k === 'action') continue;
      assert.match(v, /^=\{\{ \$fromAI\('[a-z_]+', '[^']*', '(string|number|boolean)'(, [^)]+)?\) \}\}$/, `${t.name}.${k}`);
    }
    assert.ok(t.parameters.description.length > 30);
  }
});

test('Code node: semua bisa di-compile', () => {
  for (const n of WF.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    // eslint-disable-next-line no-new-func
    assert.doesNotThrow(() => new Function('$input', '$', `return (async () => {\n${n.parameters.jsCode}\n})();`), n.name);
    assert.ok(!/module\.exports/.test(n.parameters.jsCode), `${n.name} masih berisi module.exports`);
  }
});

test('system prompt agent memuat waktu sekarang & aturan inti', () => {
  const sys = byName['Jarvis Agent'].parameters.options.systemMessage;
  assert.ok(sys.startsWith('='));
  assert.ok(sys.includes("$now.setZone('Asia/Jakarta')"));
  for (const tool of ['susun_ulang_jadwal', 'catat_progres', 'tandai_tidak_tersedia', 'lihat_tugas']) assert.ok(sys.includes(tool));
});

// ------------------------------------------------------- chat helpers -----
test('Siapkan pesan & Potong pesan', async () => {
  const tg = { message: { chat: { id: 123 }, text: '/sync' } };
  let out = await runCode('Siapkan pesan', [{ owner_chat_id: '123', just_registered: false }], { 'Telegram Trigger': [tg] });
  assert.equal(out[0].chat_id, '123');
  assert.match(out[0].text, /Sinkronkan/);
  out = await runCode('Siapkan pesan', [{ just_registered: true }], { 'Telegram Trigger': [{ message: { chat: { id: 5 }, text: '/start' } }] });
  assert.match(out[0].text, /pertama kali/);
  const long = `**Halo**\n${'baris panjang sekali\n'.repeat(400)}`;
  out = await runCode('Potong pesan', [{ output: long }], { 'Siapkan pesan': [{ chat_id: '123' }] });
  assert.ok(out.length >= 2);
  assert.ok(out.every((m) => m.text.length <= 4000 && m.chat_id === '123'));
  assert.ok(!out[0].text.includes('**'));
});

// ---------------------------------------------------- validasi tool -------
test('validasi input tool menolak data buruk', async () => {
  await assert.rejects(runCode('Validasi tugas baru', [{ title: '' }]), /title wajib/);
  await assert.rejects(runCode('Validasi tugas baru', [{ title: 'X', deadline: 'jumat' }]), /ISO 8601/);
  const ok = await runCode('Validasi tugas baru', [{ title: 'Laporan', deadline: '2026-10-24T23:59:00+07:00', effort_minutes: 240, weight: 3, task_type: 'Tugas' }]);
  assert.deepEqual(JSON.parse(ok[0].task_json), { course: null, title: 'Laporan', task_type: 'tugas', deadline: '2026-10-24T16:59:00.000Z', effort_minutes: 240, weight: 3, notes: null });
  await assert.rejects(runCode('Validasi perubahan', [{ task_id: 3 }]), /Tidak ada field/);
  await assert.rejects(runCode('Validasi perubahan', [{ task_id: 3, status: 'beres banget' }]), /status/);
  const upd = await runCode('Validasi perubahan', [{ task_id: '3', status: 'selesai', target_pct: '70', weight: '' }]);
  assert.deepEqual(JSON.parse(upd[0].changes_json), { status: 'done', target_pct: 70 });
  await assert.rejects(runCode('Validasi periode', [{ start: '2026-10-25T00:00:00+07:00', end: '2026-10-24T00:00:00+07:00' }]), /setelah/);
  await assert.rejects(runCode('Validasi pengaturan', [{ key: 'telegram_chat_id', value: '1' }]), /tidak boleh/);
  await assert.rejects(runCode('Validasi pengaturan', [{ key: 'study_end', value: '25:00' }]), /tidak valid/);
  const st = await runCode('Validasi pengaturan', [{ key: 'study_end', value: '21:00' }]);
  assert.deepEqual(st[0], { key: 'study_end', value: '21:00', append: false });
  const pr = await runCode('Validasi progres', [{ task_id: 7, minutes_done: '', finished: 'true' }]);
  assert.deepEqual(pr[0], { task_id: 7, minutes_done: 0, finished: true, note: '' });
  await assert.rejects(runCode('Cek hasil', [{}]), /tidak ditemukan/);
  await assert.rejects(runCode('Aksi tidak dikenal', [{ action: 'hack' }]), /tidak dikenal/);
});

// ------------------------------------------------------------ E2E ---------
function gEvent(id, summary, startIso, endIso) {
  return { id, summary, status: 'confirmed', start: { dateTime: startIso }, end: { dateTime: endIso } };
}
const MS_H = 3600e3;
const iso = (d) => new Date(d).toISOString();

test('E2E: sinkron -> susun ulang -> pesan pagi -> progres -> check-in', { skip: !HAS_PG }, async () => {
  psql(`truncate tasks, unavailability, study_blocks, checkins, n8n_chat_histories restart identity cascade;
        update settings set value = '' where key = 'telegram_chat_id';
        update settings set value = 'jarvis-test@group.calendar.google.com' where key = 'jarvis_calendar_id';
        update settings set value = 'saya@gmail.com' where key = 'main_calendar_id';`);
  const now = Date.now();

  // 1) Chat pertama mendaftarkan pemilik
  const auth = runSql('auth_settings', ['777']);
  assert.equal(auth[0].owner_chat_id, '777');
  assert.equal(auth[0].just_registered, true);
  assert.equal(runSql('auth_settings', ['999'])[0].owner_chat_id, '777', 'chat lain tidak bisa ambil alih');

  // 2) Sinkron: Lentera (fixture asli) + Classroom (dipalsukan)
  const ics = fs.readFileSync(path.join(__dirname, 'fixtures', 'lentera_sample.ics'), 'utf8')
    .replace(/2026102[2-9]T/g, (m) => m); // tanggal fixture dibiarkan apa adanya
  const settings = runSql('settings')[0];
  const lentera = await runCode('S: Parse Lentera', [{ data: ics }], { 'S: Muat setting': [settings] });
  assert.ok(lentera[0].lentera_tasks.length >= 5);
  const due = new Date(now + 3 * 24 * MS_H);
  const coursesResp = { courses: [{ id: 'c1', name: 'Basis Data' }, { id: 'c2', name: 'Statistika' }] };
  const split = await runCode('S: Pecah kelas', [coursesResp], { 'S: Muat setting': [settings] });
  assert.equal(split.length, 2);
  const works = [
    { courseWork: [{ id: 'w1', title: 'Laporan Normalisasi', state: 'PUBLISHED', workType: 'ASSIGNMENT', dueDate: { year: due.getUTCFullYear(), month: due.getUTCMonth() + 1, day: due.getUTCDate() }, dueTime: { hours: 16, minutes: 59 } },
      { id: 'w2', title: 'Tugas ERD', state: 'PUBLISHED', workType: 'ASSIGNMENT', dueDate: { year: due.getUTCFullYear(), month: due.getUTCMonth() + 1, day: due.getUTCDate() } }] },
    { error: { message: 'The resource was not found' } },
  ];
  const subs = [{ studentSubmissions: [{ courseWorkId: 'w2', state: 'TURNED_IN' }] }, { error: { message: 'x' } }];
  const norm = await runCode('S: Gabung & normalisasi', subs, {
    'S: Parse Lentera': lentera, 'S: Pecah kelas': split, 'S: Classroom tugas': works, 'S: Muat setting': [settings],
  });
  const incoming = JSON.parse(norm[0].tasks_json);
  assert.ok(incoming.some((t) => t.source_id === 'w1' && t.status === 'open'));
  assert.ok(incoming.some((t) => t.source_id === 'w2' && t.status === 'done'));
  const saved = runSql('sync_upsert', [norm[0].tasks_json, norm[0].ignored_courses_json]);
  assert.ok(saved[0].new_tasks.length >= 3);
  assert.ok(!saved[0].new_tasks.some((t) => t.title === 'Tugas ERD'), 'tugas yang sudah dikumpulkan tidak dilaporkan sebagai baru');
  const again = runSql('sync_upsert', [norm[0].tasks_json, norm[0].ignored_courses_json]);
  assert.equal(again[0].new_tasks.length, 0, 'sinkron ulang tidak menduplikasi');

  // 2b) "Basis Data udah selesai" -> classroom_ignore (+append) -> sinkron ulang membuang tugasnya
  const vs = await runCode('Validasi pengaturan', [{ key: 'classroom_ignore', value: '+Basis Data' }]);
  assert.deepEqual(vs[0], { key: 'classroom_ignore', value: 'Basis Data', append: true });
  runSql('set_setting', [vs[0].key, vs[0].value, vs[0].append]);
  const vs2 = await runCode('Validasi pengaturan', [{ key: 'classroom_ignore', value: '+Paduan Suara' }]);
  assert.equal(runSql('set_setting', [vs2[0].key, vs2[0].value, vs2[0].append])[0].value, 'Basis Data, Paduan Suara');
  const settings2 = runSql('settings')[0];
  const split2 = await runCode('S: Pecah kelas', [coursesResp], { 'S: Muat setting': [settings2] });
  assert.deepEqual(split2.map((c) => c.name), ['Statistika']);
  const norm2 = await runCode('S: Gabung & normalisasi', [subs[1]], {
    'S: Parse Lentera': lentera, 'S: Pecah kelas': split2, 'S: Classroom tugas': [works[1]], 'S: Muat setting': [settings2],
  });
  assert.deepEqual(JSON.parse(norm2[0].ignored_courses_json), ['Basis Data']);
  const saved2 = runSql('sync_upsert', [norm2[0].tasks_json, norm2[0].ignored_courses_json]);
  assert.equal(Number(saved2[0].dropped_from_old_courses_count), 1, 'Laporan Normalisasi dibuang');
  psql(`update settings set value = '' where key = 'classroom_ignore'`);

  // 3) Tambah tugas manual via tool
  const v = await runCode('Validasi tugas baru', [{ title: 'Laporan Jarkom', course: 'Jarkom', deadline: iso(now + 2 * 24 * MS_H), effort_minutes: 300, weight: 3 }]);
  const added = runSql('add_task', [v[0].task_json]);
  const jarkomId = added[0].id;
  assert.equal(runSql('update_task', [999999, '{"weight":1}']).length, 0, 'id tak dikenal -> 0 baris, bukan success');
  assert.equal(runSql('update_task', [jarkomId, '{"weight":3}'])[0].weight, '3');

  // 4) Susun ulang: kalender utama berisi kuliah; kalender Jarvis berisi blok lama
  const data = runSql('replan_load');
  const tomorrow9 = new Date(now + 24 * MS_H);
  tomorrow9.setUTCHours(2, 0, 0, 0); // 09:00 WIB besok
  const mainEvents = [gEvent('k1', 'Kuliah Basis Data', iso(tomorrow9), iso(tomorrow9.getTime() + 2.5 * MS_H))];
  const jarvisEvents = [gEvent('old1', '[Jarvis] lama', iso(now + 5 * MS_H), iso(now + 6 * MS_H)), gEvent('old0', '[Jarvis] berjalan', iso(now - 0.5 * MS_H), iso(now + 0.5 * MS_H))];
  const sched = await runCode('R: Penjadwal', jarvisEvents, { 'R: Muat data': data, 'R: Event kalender utama': mainEvents });
  const res = sched[0];
  assert.deepEqual(res.to_delete, ['old1'], 'hanya blok yang belum mulai yang dihapus');
  assert.ok(res.blocks.length > 0);
  for (const b of res.blocks) {
    assert.ok(!(new Date(b.start) < new Date(mainEvents[0].end.dateTime) && new Date(mainEvents[0].start.dateTime) < new Date(b.end)), 'bentrok dengan kuliah');
    assert.ok(new Date(b.start) >= new Date(now + 0.5 * MS_H) || new Date(b.end) <= new Date(now - 0.5 * MS_H), 'bentrok dengan blok berjalan');
    assert.match(b.summary, /^\[Jarvis\] /);
  }
  const del = await runCode('R: Daftar hapus', [res]);
  assert.deepEqual(del, [{ id: 'old1' }]);
  const toCreate = await runCode('R: Daftar blok baru', [{}], { 'R: Penjadwal': sched });
  assert.equal(toCreate.length, res.blocks.length);
  const created = toCreate.map((b, i) => (i === 1 ? { error: 'quota' } : { id: `ev${i}`, summary: b.summary }));
  const col = await runCode('R: Kumpulkan event', created, { 'R: Daftar blok baru': toCreate, 'R: Hapus blok lama': [{ success: true }] });
  assert.equal(col[0].failed_count, 1);
  assert.equal(col[0].created_count, res.blocks.length - 1);
  const savedBlocks = runSql('save_blocks', [col[0].rows_json]);
  assert.equal(Number(savedBlocks[0].inserted), res.blocks.length - 1);
  const summary = await runCode('R: Ringkasan', [savedBlocks[0]], {
    'R: Penjadwal': sched, 'R: Kumpulkan event': col, 'R: Muat data': data,
    'S: Simpan tugas': saved, 'S: Gabung & normalisasi': norm,
  });
  const s = summary[0];
  assert.equal(s.telegram_chat_id, '777');
  assert.equal(s.ok, false, 'ada 1 blok gagal');
  assert.ok(s.sinkronisasi && s.sinkronisasi.tugas_baru.length >= 3);
  assert.ok(Array.isArray(s.tidak_muat));

  // 5) Pesan pagi
  const pagi = await runCode('Pesan pagi', [s]);
  assert.equal(pagi[0].chat_id, '777');
  assert.match(pagi[0].text, /Selamat pagi/);
  assert.match(pagi[0].text, /Tugas baru/);
  runSql('memory_insert', [pagi[0].chat_id, pagi[0].text]);

  // 6) Sakit 3 hari -> blok pindah setelah periode itu
  const p = await runCode('Validasi periode', [{ start: iso(now), end: iso(now + 3 * 24 * MS_H), note: 'sakit' }]);
  runSql('set_unavailable', [p[0].start, p[0].end, p[0].reason]);
  const data2 = runSql('replan_load');
  const sched2 = await runCode('R: Penjadwal', [{}], { 'R: Muat data': data2, 'R: Event kalender utama': mainEvents });
  assert.ok(sched2[0].blocks.every((b) => new Date(b.start) >= new Date(now + 3 * 24 * MS_H)), 'tidak ada blok saat sakit');
  assert.ok(sched2[0].infeasible.some((x) => String(x.task_id) === String(jarkomId)), 'Laporan Jarkom (deadline 2 hari) tidak muat');

  // 7) Progres + check-in
  const prog = await runCode('Validasi progres', [{ task_id: jarkomId, minutes_done: 60, finished: false }]);
  const logged = runSql('log_progress', [prog[0].task_id, prog[0].minutes_done, prog[0].finished, prog[0].note]);
  assert.equal(Number(logged[0].done_minutes), 60);
  psql(`insert into study_blocks (task_id, start_at, end_at) values (${jarkomId}, now() - interval '2 hour', now() - interval '1 hour')`);
  const ck = runSql('checkin_load');
  const msg = await runCode('Pesan check-in', ck);
  assert.equal(msg[0].chat_id, '777');
  assert.match(msg[0].text, /Check-in malam/);
  // Blok "hari ini" hanya muncul jika dimulai setelah 00:00 WIB hari ini.
  const startedToday = new Date(Date.now() - 2 * MS_H).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  if (startedToday) assert.match(msg[0].text, new RegExp(`\\[#${jarkomId}\\]`));
  runSql('memory_insert', [msg[0].chat_id, msg[0].text]);
  const mem = psql(`select count(*) from n8n_chat_histories where session_id = '777' and message->>'type' = 'ai'`);
  assert.match(mem, /\b2\b/);

  // 8) lihat_jadwal
  const range = await runCode('Rentang jadwal', [{}]);
  const blocks = runSql('get_schedule', [range[0].start, range[0].end]);
  const merged = await runCode('Gabung jadwal', mainEvents, { 'Rentang jadwal': range, 'Ambil blok Jarvis': blocks });
  assert.ok(Array.isArray(merged[0].blok_belajar_jarvis));
  assert.equal(merged[0].acara_kalender_utama[0].judul, 'Kuliah Basis Data');
});
