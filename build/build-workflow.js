#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Membangun workflows/jarvis-akademik.json dari sumber di src/.
//   node build/build-workflow.js
// Kode Code node ditulis di src/nodes/*.js. Baris "// @lib a.js b.js" diganti
// isi src/lib/a.js, b.js (supaya logika yang sama bisa di-unit-test).
// SQL ada di src/sql/*.sql, system prompt di prompts/system-prompt.md.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------- helpers ---
function uuidFrom(name) {
  const h = crypto.createHash('sha1').update(`jarvis-akademik:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function stripExports(code) {
  return code.replace(/\nif \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*?\n\}\n?/g, '\n');
}

function codeFrom(file) {
  const body = read(`src/nodes/${file}`);
  return body.replace(/^\/\/ @lib (.+)$/m, (_, libs) => {
    const parts = libs.trim().split(/\s+/).map((l) => stripExports(read(`src/lib/${l}`)).trim());
    return `// ===== library (dibangun dari src/lib — edit di sana, bukan di sini) =====\n${parts.join('\n\n')}\n// ===== akhir library =====`;
  });
}

const sql = (name) => read(`src/sql/${name}.sql`).trim();

const CRED = {
  postgres: { postgres: { id: 'jarvis-postgres', name: 'Jarvis Supabase' } },
  telegram: { telegramApi: { id: 'jarvis-telegram', name: 'Jarvis Telegram Bot' } },
  gcal: { googleCalendarOAuth2Api: { id: 'jarvis-gcal', name: 'Jarvis Google Calendar' } },
  google: { googleOAuth2Api: { id: 'jarvis-google', name: 'Jarvis Google Classroom' } },
  lentera: { httpQueryAuth: { id: 'jarvis-lentera', name: 'Lentera iCal token' } },
  gemini: { googlePalmApi: { id: 'jarvis-gemini', name: 'Gemini API' } },
};

const nodes = [];
const connections = {};

function add(node) {
  if (nodes.some((n) => n.name === node.name)) throw new Error(`Nama node duplikat: ${node.name}`);
  nodes.push({ id: uuidFrom(node.name), ...node });
  return node.name;
}

function connect(from, to, { output = 0, input = 0, type = 'main' } = {}) {
  connections[from] = connections[from] || {};
  connections[from][type] = connections[from][type] || [];
  while (connections[from][type].length <= output) connections[from][type].push([]);
  connections[from][type][output].push({ node: to, type, index: input });
}

function chain(...names) {
  for (let i = 0; i < names.length - 1; i++) connect(names[i], names[i + 1]);
}

const code = (name, file, position, extra = {}) =>
  add({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { jsCode: codeFrom(file) }, ...extra });

const pg = (name, sqlName, replacement, position, extra = {}) =>
  add({
    name,
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.5,
    position,
    parameters: {
      operation: 'executeQuery',
      query: sql(sqlName),
      options: replacement ? { queryReplacement: replacement } : {},
    },
    credentials: CRED.postgres,
    ...extra,
  });

const tgSend = (name, position, extra = {}) =>
  add({
    name,
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position,
    webhookId: uuidFrom(`${name}-webhook`),
    parameters: {
      chatId: '={{ $json.chat_id }}',
      text: '={{ $json.text }}',
      // Telegram node selalu memakai parse mode (default Markdown lama yang
      // mudah error). HTML lebih aman; teks sudah di-escape di Code node.
      additionalFields: { appendAttribution: false, parse_mode: 'HTML' },
    },
    credentials: CRED.telegram,
    ...extra,
  });

const calRL = (expr) => ({ __rl: true, mode: 'id', value: `={{ ${expr} }}` });

const sticky = (name, content, position, width, height, color = 7) =>
  add({
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
    parameters: { content, width, height, color },
  });

// Input sub-workflow "Jarvis Tools" (semua bertipe any; divalidasi di Code).
const TOOL_FIELDS = [
  'action', 'task_id', 'title', 'course', 'task_type', 'deadline', 'effort_minutes', 'weight',
  'target_pct', 'status', 'minutes_done', 'finished', 'note', 'start', 'end', 'key', 'value',
];
// Tipe "any" di trigger = field schema tanpa properti `type` (sama seperti
// yang dibuat editor n8n).
const toolSchema = TOOL_FIELDS.map((f) => ({
  id: f, displayName: f, required: false, defaultMatch: false, display: true,
  canBeUsedToMatch: true, removed: false,
}));
const workflowInputs = (value) => ({
  mappingMode: 'defineBelow',
  value,
  matchingColumns: [],
  schema: toolSchema,
  attemptToConvertTypes: false,
  convertFieldsToString: false,
});
const SELF = { __rl: true, mode: 'id', value: '={{ $workflow.id }}' };
const ai = (key, desc, type = 'string', def) => {
  const d = desc.replace(/'/g, '’');
  return def === undefined
    ? `={{ $fromAI('${key}', '${d}', '${type}') }}`
    : `={{ $fromAI('${key}', '${d}', '${type}', ${JSON.stringify(def)}) }}`;
};

// ===================================================== A. Chat Telegram ====
const AX = 0;
const AY = 0;
sticky('Catatan A', '## A. Chat Telegram\nPesan masuk → cek pemilik bot → **AI Agent** (Gemini) memilih tool → balas.\nChat pertama yang mengirim /start otomatis jadi pemilik.', [AX - 40, AY - 200], 1440, 140, 4);
add({
  name: 'Telegram Trigger',
  type: 'n8n-nodes-base.telegramTrigger',
  typeVersion: 1.2,
  position: [AX, AY],
  webhookId: uuidFrom('telegram-trigger-webhook'),
  parameters: { updates: ['message'], additionalFields: {} },
  credentials: CRED.telegram,
});
pg('Cek pemilik & setting', 'auth_settings', '={{ [ String($json.message.chat.id) ] }}', [AX + 220, AY]);
add({
  name: 'Pemilik bot?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [AX + 440, AY],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{
        id: uuidFrom('cond-owner'),
        leftValue: '={{ String($json.owner_chat_id) }}',
        rightValue: "={{ String($('Telegram Trigger').item.json.message.chat.id) }}",
        operator: { type: 'string', operation: 'equals' },
      }],
      combinator: 'and',
    },
    options: {},
  },
});
code('Siapkan pesan', 'chat_prepare.js', [AX + 660, AY - 20]);
add({
  name: 'Jarvis Agent',
  type: '@n8n/n8n-nodes-langchain.agent',
  typeVersion: 2,
  position: [AX + 880, AY - 20],
  parameters: {
    promptType: 'define',
    text: '={{ $json.text }}',
    options: { systemMessage: `=${read('prompts/system-prompt.md').trim()}`, maxIterations: 12 },
  },
});
code('Potong pesan', 'chat_split.js', [AX + 1180, AY - 20]);
tgSend('Kirim balasan', [AX + 1400, AY - 20]);
add({
  name: 'Tolak',
  type: 'n8n-nodes-base.telegram',
  typeVersion: 1.2,
  position: [AX + 660, AY + 160],
  webhookId: uuidFrom('tolak-webhook'),
  parameters: {
    chatId: "={{ $('Telegram Trigger').item.json.message.chat.id }}",
    text: 'Maaf, Jarvis Akademik ini bot pribadi dan sudah punya pemilik.',
    additionalFields: { appendAttribution: false, parse_mode: 'HTML' },
  },
  credentials: CRED.telegram,
});
chain('Telegram Trigger', 'Cek pemilik & setting', 'Pemilik bot?');
connect('Pemilik bot?', 'Siapkan pesan', { output: 0 });
connect('Pemilik bot?', 'Tolak', { output: 1 });
chain('Siapkan pesan', 'Jarvis Agent', 'Potong pesan', 'Kirim balasan');

add({
  name: 'Gemini',
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  typeVersion: 1,
  position: [AX + 700, AY + 380],
  parameters: { modelName: 'models/gemini-2.5-flash', options: { temperature: 0.2, maxOutputTokens: 8192 } },
  credentials: CRED.gemini,
});
add({
  name: 'Memori percakapan',
  type: '@n8n/n8n-nodes-langchain.memoryPostgresChat',
  typeVersion: 1.3,
  position: [AX + 840, AY + 380],
  parameters: {
    sessionIdType: 'customKey',
    sessionKey: "={{ $('Siapkan pesan').first().json.chat_id }}",
    tableName: 'n8n_chat_histories',
    contextWindowLength: 20,
  },
  credentials: CRED.postgres,
});
connect('Gemini', 'Jarvis Agent', { type: 'ai_languageModel' });
connect('Memori percakapan', 'Jarvis Agent', { type: 'ai_memory' });

const TOOLS = [
  ['lihat_tugas', 'Lihat semua tugas yang belum selesai (id, matkul, deadline, sisa menit, bobot, target) dan periode tidak tersedia. Panggil sebelum menambah atau mengubah tugas.', { action: 'list_tasks' }],
  ['tambah_tugas', 'Tambah tugas/ujian baru yang belum ada di daftar. Setelah itu panggil susun_ulang_jadwal.', {
    action: 'add_task',
    title: ai('title', 'Judul singkat tugas, mis. Laporan praktikum modul 3'),
    course: ai('course', 'Nama mata kuliah, mis. Jaringan Komputer', 'string', ''),
    task_type: ai('task_type', 'Salah satu: tugas, kuis, lab, ujian, bacaan, lainnya', 'string', 'tugas'),
    deadline: ai('deadline', 'Deadline ISO 8601 dengan +07:00. Kosongkan jika tidak ada deadline', 'string', ''),
    effort_minutes: ai('effort_minutes', 'Perkiraan total menit pengerjaan', 'number'),
    weight: ai('weight', 'Bobot nilai: 1 rendah, 2 sedang, 3 tinggi (ujian/tugas besar)', 'number', 2),
    note: ai('note', 'Catatan tambahan, opsional', 'string', ''),
  }],
  ['ubah_tugas', 'Ubah data tugas yang sudah ada: deadline, effort, bobot, target_pct (persen yang dikejar), atau status (open/done/dropped). Field yang tidak diubah dikosongkan.', {
    action: 'update_task',
    task_id: ai('task_id', 'ID tugas dari lihat_tugas', 'number'),
    title: ai('title', 'Judul baru, kosongkan jika tidak diubah', 'string', ''),
    course: ai('course', 'Mata kuliah baru, kosongkan jika tidak diubah', 'string', ''),
    task_type: ai('task_type', 'Jenis baru, kosongkan jika tidak diubah', 'string', ''),
    deadline: ai('deadline', 'Deadline baru ISO 8601 +07:00, kosongkan jika tidak diubah', 'string', ''),
    effort_minutes: ai('effort_minutes', 'Total menit pengerjaan baru (angka), kosongkan jika tidak diubah', 'string', ''),
    weight: ai('weight', 'Bobot baru 1-3, kosongkan jika tidak diubah', 'string', ''),
    target_pct: ai('target_pct', 'Persen pengerjaan yang dikejar 0-100, kosongkan jika tidak diubah', 'string', ''),
    status: ai('status', 'open, done, atau dropped; kosongkan jika tidak diubah', 'string', ''),
    note: ai('note', 'Catatan, kosongkan jika tidak diubah', 'string', ''),
  }],
  ['catat_progres', 'Catat hasil belajar dari check-in: berapa menit sudah dikerjakan dan apakah tugas selesai. Jika belum/kurang, panggil susun_ulang_jadwal setelahnya.', {
    action: 'log_progress',
    task_id: ai('task_id', 'ID tugas', 'number'),
    minutes_done: ai('minutes_done', 'Menit yang dikerjakan sejak check-in terakhir (0 jika belum sama sekali)', 'number', 0),
    finished: ai('finished', 'true jika tugas sudah selesai seluruhnya', 'boolean', false),
    note: ai('note', 'Catatan singkat, mis. capek', 'string', ''),
  }],
  ['tandai_tidak_tersedia', 'Catat periode user tidak bisa belajar (sakit, acara, perjalanan). Panggil susun_ulang_jadwal setelahnya.', {
    action: 'set_unavailable',
    start: ai('start', 'Mulai, ISO 8601 +07:00', 'string'),
    end: ai('end', 'Selesai, ISO 8601 +07:00 (mis. sakit 3 hari mulai Senin = Senin 00:00 sampai Kamis 00:00)', 'string'),
    note: ai('note', 'Alasan, mis. sakit', 'string', ''),
  }],
  ['hapus_tidak_tersedia', 'Hapus periode tidak tersedia yang beririsan dengan rentang ini (mis. user sudah sembuh lebih cepat).', {
    action: 'clear_unavailable',
    start: ai('start', 'Mulai rentang, ISO 8601 +07:00', 'string'),
    end: ai('end', 'Akhir rentang, ISO 8601 +07:00', 'string'),
  }],
  ['ubah_pengaturan', 'Ubah preferensi penjadwalan. key: study_start/study_end (HH:MM), max_daily_minutes, max_task_minutes_per_day, block_max_minutes, block_min_minutes, break_minutes, deadline_buffer_minutes, horizon_days, rest_days (mis. "0" = Minggu libur), semester_start (YYYY-MM-DD, kelas Classroom sebelum tanggal ini diabaikan), classroom_ignore (nama kelas dipisah koma; awali value dengan + untuk menambah ke daftar).', {
    action: 'set_setting',
    key: ai('key', 'Nama pengaturan', 'string'),
    value: ai('value', 'Nilai baru sebagai teks', 'string'),
  }],
  ['lihat_jadwal', 'Lihat blok belajar Jarvis dan acara di kalender utama pada rentang waktu tertentu. Default: hari ini dan besok.', {
    action: 'get_schedule',
    start: ai('start', 'Mulai rentang ISO 8601 +07:00, kosongkan untuk hari ini 00:00', 'string', ''),
    end: ai('end', 'Akhir rentang ISO 8601 +07:00, kosongkan untuk lusa 00:00', 'string', ''),
  }],
  ['susun_ulang_jadwal', 'Hapus blok belajar lama yang belum dimulai lalu susun ulang semua tugas ke Google Calendar secara otomatis (tanpa bentrok). Mengembalikan ringkasan, tugas yang tidak muat, dan tugas lewat deadline.', { action: 'replan' }],
  ['sinkronkan_lentera_classroom', 'Ambil tugas & deadline terbaru dari Lentera dan Google Classroom, simpan, lalu susun ulang jadwal. Mengembalikan tugas baru dan peringatan.', { action: 'sync' }],
];
TOOLS.forEach(([name, description, value], i) => {
  add({
    name,
    type: '@n8n/n8n-nodes-langchain.toolWorkflow',
    typeVersion: 2.2,
    position: [AX + 980 + (i % 5) * 150, AY + 340 + Math.floor(i / 5) * 160],
    parameters: { description, workflowId: SELF, workflowInputs: workflowInputs(value) },
  });
  connect(name, 'Jarvis Agent', { type: 'ai_tool' });
});

// ======================================================= B. Jarvis Tools ===
const BX = 0;
const BY = 900;
sticky('Catatan B', '## B. Jarvis Tools (dipanggil agent & jadwal)\nSemua aksi lewat satu pintu. Input divalidasi di Code node sebelum menyentuh database.', [BX - 40, BY - 160], 1500, 120, 5);
add({
  name: 'Jarvis Tools',
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  typeVersion: 1.1,
  position: [BX, BY + 600],
  parameters: { inputSource: 'workflowInputs', workflowInputs: { values: TOOL_FIELDS.map((name) => ({ name, type: 'any' })) } },
});
const ACTIONS = ['list_tasks', 'add_task', 'update_task', 'log_progress', 'set_unavailable', 'clear_unavailable', 'set_setting', 'get_schedule', 'replan', 'sync', 'unknown'];
add({
  name: 'Pilih aksi',
  type: 'n8n-nodes-base.switch',
  typeVersion: 3.2,
  position: [BX + 220, BY + 600],
  parameters: {
    mode: 'expression',
    numberOutputs: ACTIONS.length,
    output: `={{ (i => i < 0 ? ${ACTIONS.length - 1} : i)(${JSON.stringify(ACTIONS.slice(0, -1))}.indexOf($json.action)) }}`,
  },
});
connect('Jarvis Tools', 'Pilih aksi');

const rowY = (i) => BY + i * 140;
const BC = BX + 480;
// 0 list_tasks
pg('Daftar tugas', 'list_tasks', '', [BC, rowY(0)], { alwaysOutputData: true });
connect('Pilih aksi', 'Daftar tugas', { output: 0 });
// 1 add_task
code('Validasi tugas baru', 'v_add_task.js', [BC, rowY(1)]);
pg('Simpan tugas baru', 'add_task', '={{ [ $json.task_json ] }}', [BC + 220, rowY(1)], { alwaysOutputData: true });
connect('Pilih aksi', 'Validasi tugas baru', { output: 1 });
chain('Validasi tugas baru', 'Simpan tugas baru');
// 2 update_task
code('Validasi perubahan', 'v_update_task.js', [BC, rowY(2)]);
pg('Ubah tugas', 'update_task', '={{ [ $json.task_id, $json.changes_json ] }}', [BC + 220, rowY(2)], { alwaysOutputData: true });
connect('Pilih aksi', 'Validasi perubahan', { output: 2 });
chain('Validasi perubahan', 'Ubah tugas');
// 3 log_progress
code('Validasi progres', 'v_progress.js', [BC, rowY(3)]);
pg('Simpan progres', 'log_progress', '={{ [ $json.task_id, $json.minutes_done, $json.finished, $json.note ] }}', [BC + 220, rowY(3)], { alwaysOutputData: true });
connect('Pilih aksi', 'Validasi progres', { output: 3 });
chain('Validasi progres', 'Simpan progres');
// 4 set_unavailable
code('Validasi periode', 'v_period.js', [BC, rowY(4)]);
pg('Simpan tidak tersedia', 'set_unavailable', '={{ [ $json.start, $json.end, $json.reason ] }}', [BC + 220, rowY(4)], { alwaysOutputData: true });
connect('Pilih aksi', 'Validasi periode', { output: 4 });
chain('Validasi periode', 'Simpan tidak tersedia');
// 5 clear_unavailable
code('Validasi periode hapus', 'v_period.js', [BC, rowY(5)]);
pg('Hapus tidak tersedia', 'clear_unavailable', '={{ [ $json.start, $json.end ] }}', [BC + 220, rowY(5)], { alwaysOutputData: true });
connect('Pilih aksi', 'Validasi periode hapus', { output: 5 });
chain('Validasi periode hapus', 'Hapus tidak tersedia');
// 6 set_setting
code('Validasi pengaturan', 'v_setting.js', [BC, rowY(6)]);
pg('Simpan pengaturan', 'set_setting', '={{ [ $json.key, $json.value, $json.append ] }}', [BC + 220, rowY(6)], { alwaysOutputData: true });
connect('Pilih aksi', 'Validasi pengaturan', { output: 6 });
chain('Validasi pengaturan', 'Simpan pengaturan');
// ujung bersama: pastikan ada hasil
code('Cek hasil', 'check_result.js', [BC + 460, rowY(3)]);
['Simpan tugas baru', 'Ubah tugas', 'Simpan progres', 'Simpan tidak tersedia', 'Hapus tidak tersedia', 'Simpan pengaturan']
  .forEach((n) => connect(n, 'Cek hasil'));
// 7 get_schedule
code('Rentang jadwal', 'v_schedule_range.js', [BC, rowY(7)]);
pg('Ambil blok Jarvis', 'get_schedule', '={{ [ $json.start, $json.end ] }}', [BC + 220, rowY(7)]);
pg('Muat setting jadwal', 'settings', '', [BC + 440, rowY(7)], { executeOnce: true });
add({
  name: 'Acara kalender utama',
  type: 'n8n-nodes-base.googleCalendar',
  typeVersion: 1.3,
  position: [BC + 660, rowY(7)],
  parameters: {
    operation: 'getAll',
    calendar: calRL('$json.settings.main_calendar_id'),
    returnAll: true,
    timeMin: "={{ $('Rentang jadwal').first().json.start }}",
    timeMax: "={{ $('Rentang jadwal').first().json.end }}",
    options: { recurringEventHandling: 'expand' },
  },
  credentials: CRED.gcal,
  executeOnce: true,
  alwaysOutputData: true,
});
code('Gabung jadwal', 'merge_schedule.js', [BC + 880, rowY(7)]);
connect('Pilih aksi', 'Rentang jadwal', { output: 7 });
chain('Rentang jadwal', 'Ambil blok Jarvis', 'Muat setting jadwal', 'Acara kalender utama', 'Gabung jadwal');
// 10 unknown
code('Aksi tidak dikenal', 'unknown_action.js', [BC, rowY(10) + 40]);
connect('Pilih aksi', 'Aksi tidak dikenal', { output: 10 });

// ------------------------------------------------- sync (aksi 9) -----------
const SY = rowY(9) + 40;
pg('S: Muat setting', 'settings', '', [BC, SY], { executeOnce: true });
add({
  name: 'S: Lentera iCal',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [BC + 220, SY],
  parameters: {
    url: 'https://lentera.petra.ac.id/calendar/export_execute.php',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpQueryAuth',
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: 'userid', value: '={{ $json.settings.lentera_userid }}' },
        { name: 'preset_what', value: 'all' },
        { name: 'preset_time', value: 'recentupcoming' },
      ],
    },
    options: { response: { response: { responseFormat: 'text', outputPropertyName: 'data' } }, timeout: 20000 },
  },
  credentials: CRED.lentera,
  executeOnce: true,
  onError: 'continueRegularOutput',
});
code('S: Parse Lentera', 's_parse_lentera.js', [BC + 440, SY]);
const classroomGet = (name, url, query, position) =>
  add({
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    parameters: {
      url,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleOAuth2Api',
      sendQuery: true,
      queryParameters: { parameters: query },
      options: { timeout: 20000 },
    },
    credentials: CRED.google,
    onError: 'continueRegularOutput',
  });
classroomGet('S: Classroom kelas', 'https://classroom.googleapis.com/v1/courses',
  [{ name: 'studentId', value: 'me' }, { name: 'courseStates', value: 'ACTIVE' }, { name: 'pageSize', value: '50' }],
  [BC + 660, SY]);
nodes[nodes.length - 1].executeOnce = true;
code('S: Pecah kelas', 's_split_courses.js', [BC + 880, SY]);
classroomGet('S: Classroom tugas', '=https://classroom.googleapis.com/v1/courses/{{ $json.id }}/courseWork',
  [{ name: 'pageSize', value: '100' }], [BC + 1100, SY]);
classroomGet('S: Classroom status', "=https://classroom.googleapis.com/v1/courses/{{ $('S: Pecah kelas').all()[$itemIndex].json.id }}/courseWork/-/studentSubmissions",
  [{ name: 'pageSize', value: '200' }], [BC + 1320, SY]);
code('S: Gabung & normalisasi', 's_normalize.js', [BC + 1540, SY]);
pg('S: Simpan tugas', 'sync_upsert', '={{ [ $json.tasks_json, $json.ignored_courses_json ] }}', [BC + 1760, SY]);
connect('Pilih aksi', 'S: Muat setting', { output: 9 });
chain('S: Muat setting', 'S: Lentera iCal', 'S: Parse Lentera', 'S: Classroom kelas', 'S: Pecah kelas',
  'S: Classroom tugas', 'S: Classroom status', 'S: Gabung & normalisasi', 'S: Simpan tugas');

// ------------------------------------------------ replan (aksi 8) ----------
const RY = rowY(8) + 20;
pg('R: Muat data', 'replan_load', '', [BC, RY], { executeOnce: true });
add({
  name: 'R: Event kalender utama',
  type: 'n8n-nodes-base.googleCalendar',
  typeVersion: 1.3,
  position: [BC + 220, RY],
  parameters: {
    operation: 'getAll',
    calendar: calRL('$json.settings.main_calendar_id'),
    returnAll: true,
    timeMin: '={{ $now.toISO() }}',
    timeMax: "={{ $now.plus({ days: Number($json.settings.horizon_days || 14) + 2 }).toISO() }}",
    options: { recurringEventHandling: 'expand' },
  },
  credentials: CRED.gcal,
  executeOnce: true,
  alwaysOutputData: true,
});
add({
  name: 'R: Event Jarvis',
  type: 'n8n-nodes-base.googleCalendar',
  typeVersion: 1.3,
  position: [BC + 440, RY],
  parameters: {
    operation: 'getAll',
    calendar: calRL("$('R: Muat data').first().json.settings.jarvis_calendar_id"),
    returnAll: true,
    timeMin: "={{ $now.minus({ hours: 12 }).toISO() }}",
    timeMax: "={{ $now.plus({ days: 90 }).toISO() }}",
    options: { recurringEventHandling: 'expand' },
  },
  credentials: CRED.gcal,
  executeOnce: true,
  alwaysOutputData: true,
});
code('R: Penjadwal', 'r_scheduler.js', [BC + 660, RY]);
code('R: Daftar hapus', 'r_delete_list.js', [BC + 880, RY], { alwaysOutputData: true });
add({
  name: 'R: Hapus blok lama',
  type: 'n8n-nodes-base.googleCalendar',
  typeVersion: 1.3,
  position: [BC + 1100, RY],
  parameters: {
    operation: 'delete',
    calendar: calRL("$('R: Penjadwal').first().json.jarvis_calendar_id"),
    eventId: '={{ $json.id || "tidak-ada" }}',
    options: {},
  },
  credentials: CRED.gcal,
  onError: 'continueRegularOutput',
});
code('R: Daftar blok baru', 'r_create_list.js', [BC + 1320, RY], { alwaysOutputData: true });
add({
  name: 'R: Buat blok',
  type: 'n8n-nodes-base.googleCalendar',
  typeVersion: 1.3,
  position: [BC + 1540, RY],
  parameters: {
    calendar: calRL("$('R: Penjadwal').first().json.jarvis_calendar_id"),
    start: '={{ $json.start }}',
    end: '={{ $json.end }}',
    additionalFields: { summary: '={{ $json.summary }}', description: '={{ $json.description }}' },
  },
  credentials: CRED.gcal,
  onError: 'continueRegularOutput',
});
code('R: Kumpulkan event', 'r_collect.js', [BC + 1760, RY]);
pg('R: Simpan blok', 'save_blocks', '={{ [ $json.rows_json ] }}', [BC + 1980, RY]);
code('R: Ringkasan', 'r_summary.js', [BC + 2200, RY]);
connect('Pilih aksi', 'R: Muat data', { output: 8 });
connect('S: Simpan tugas', 'R: Muat data');
chain('R: Muat data', 'R: Event kalender utama', 'R: Event Jarvis', 'R: Penjadwal', 'R: Daftar hapus',
  'R: Hapus blok lama', 'R: Daftar blok baru', 'R: Buat blok', 'R: Kumpulkan event', 'R: Simpan blok', 'R: Ringkasan');
// Setelah hapus, "R: Daftar blok baru" cukup jalan sekali (ia membaca R: Penjadwal,
// bukan inputnya). JANGAN pasang executeOnce di "R: Kumpulkan event": itu memotong
// input menjadi 1 item dan blok lain dianggap gagal.
nodes.find((n) => n.name === 'R: Daftar blok baru').executeOnce = true;

// ================================================= C. Jadwal otomatis =====
const CX = 0;
const CY = 3000;
sticky('Catatan C', '## C. Otomatis harian\n06:30 sinkron Lentera + Classroom → susun ulang → kirim rencana pagi.\n20:00 check-in malam. Pesan juga disimpan ke memori agent supaya balasan "udah"/"belum" dipahami.', [CX - 40, CY - 180], 1400, 130, 6);
add({
  name: 'Tiap pagi 06:30',
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [CX, CY],
  parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 6, triggerAtMinute: 30 }] } },
});
add({
  name: 'Jalankan sinkron',
  type: 'n8n-nodes-base.executeWorkflow',
  typeVersion: 1.2,
  position: [CX + 220, CY],
  parameters: {
    workflowId: SELF,
    workflowInputs: workflowInputs({ action: 'sync' }),
    mode: 'once',
    options: { waitForSubWorkflow: true },
  },
});
code('Pesan pagi', 'm_message.js', [CX + 440, CY]);
tgSend('Kirim pesan pagi', [CX + 660, CY]);
pg('Simpan ke memori (pagi)', 'memory_insert', "={{ [ $('Pesan pagi').first().json.chat_id, $('Pesan pagi').first().json.plain ] }}", [CX + 880, CY], { executeOnce: true });
chain('Tiap pagi 06:30', 'Jalankan sinkron', 'Pesan pagi', 'Kirim pesan pagi', 'Simpan ke memori (pagi)');

add({
  name: 'Tiap malam 20:00',
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [CX, CY + 220],
  parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 20, triggerAtMinute: 0 }] } },
});
pg('Muat check-in', 'checkin_load', '', [CX + 220, CY + 220]);
code('Pesan check-in', 'c_message.js', [CX + 440, CY + 220]);
tgSend('Kirim check-in', [CX + 660, CY + 220]);
pg('Simpan ke memori (malam)', 'memory_insert', "={{ [ $('Pesan check-in').first().json.chat_id, $('Pesan check-in').first().json.plain ] }}", [CX + 880, CY + 220], { executeOnce: true });
chain('Tiap malam 20:00', 'Muat check-in', 'Pesan check-in', 'Kirim check-in', 'Simpan ke memori (malam)');

// ============================================================== output ====
const workflow = {
  name: 'Jarvis Akademik (MVP)',
  nodes,
  connections,
  pinData: {},
  active: false,
  settings: {
    executionOrder: 'v1',
    timezone: 'Asia/Jakarta',
    callerPolicy: 'workflowsFromSameOwner',
    saveManualExecutions: true,
  },
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

const out = path.join(ROOT, 'workflows', 'jarvis-akademik.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`OK: ${nodes.length} node -> ${path.relative(ROOT, out)}`);
