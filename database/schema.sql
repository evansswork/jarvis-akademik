-- ===========================================================================
-- Jarvis Akademik — skema database (PostgreSQL / Supabase)
-- Jalankan sekali di Supabase: SQL Editor -> New query -> paste -> Run.
-- Aman dijalankan ulang (idempotent).
-- ===========================================================================

-- Tugas dari semua sumber (manual via Telegram, Lentera, Classroom).
create table if not exists tasks (
  id              bigserial primary key,
  source          text        not null default 'manual'
                  check (source in ('manual', 'lentera', 'classroom')),
  source_id       text,                       -- id unik di sumbernya (null utk manual)
  course          text,                       -- nama / kode mata kuliah
  title           text        not null,
  task_type       text        not null default 'tugas'
                  check (task_type in ('tugas', 'kuis', 'lab', 'ujian', 'bacaan', 'lainnya')),
  deadline        timestamptz,                -- null = tanpa deadline
  effort_minutes  int         not null default 90  check (effort_minutes >= 0),
  done_minutes    int         not null default 0   check (done_minutes >= 0),
  weight          int         not null default 2   check (weight between 1 and 3),   -- 1 rendah, 3 tinggi
  target_pct      int         not null default 100 check (target_pct between 0 and 100), -- diturunkan agent bila mustahil
  status          text        not null default 'open'
                  check (status in ('open', 'done', 'dropped', 'expired')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists tasks_open_deadline_idx on tasks (deadline) where status = 'open';

-- Waktu ketika user tidak bisa belajar (sakit, acara, dsb.).
create table if not exists unavailability (
  id          bigserial primary key,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  reason      text,
  created_at  timestamptz not null default now(),
  check (end_at > start_at)
);

-- Blok belajar yang dibuat Jarvis (cermin dari kalender "Jarvis Akademik").
create table if not exists study_blocks (
  id             bigserial primary key,
  task_id        bigint      not null references tasks (id) on delete cascade,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  gcal_event_id  text,
  status         text        not null default 'planned'
                 check (status in ('planned', 'done', 'missed')),
  created_at     timestamptz not null default now()
);
create index if not exists study_blocks_start_idx on study_blocks (start_at);

-- Riwayat check-in (dipakai untuk evaluasi & kalibrasi effort).
create table if not exists checkins (
  id            bigserial primary key,
  task_id       bigint      references tasks (id) on delete set null,
  minutes_done  int         not null default 0,
  finished      boolean     not null default false,
  note          text,
  created_at    timestamptz not null default now()
);

-- Pengaturan (key/value). Ubah lewat SQL atau minta ke Jarvis via chat.
create table if not exists settings (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz not null default now()
);

-- Memori percakapan agent (format bawaan node "Postgres Chat Memory" n8n).
create table if not exists n8n_chat_histories (
  id          serial primary key,
  session_id  varchar(255) not null,
  message     jsonb        not null
);
create index if not exists n8n_chat_histories_session_idx on n8n_chat_histories (session_id);

-- ---------------------------------------------------------------------------
-- Nilai awal pengaturan. GANTI baris bertanda  <-- ISI  sebelum dipakai.
-- (on conflict do nothing: menjalankan ulang tidak menimpa nilai yang ada)
-- ---------------------------------------------------------------------------
insert into settings (key, value) values
  ('main_calendar_id',          'emailkamu@gmail.com'),                    -- <-- ISI: kalender utama (biasanya = email Google)
  ('jarvis_calendar_id',        'xxxx@group.calendar.google.com'),         -- <-- ISI: ID kalender "Jarvis Akademik"
  ('lentera_userid',            ''),                                       -- <-- ISI: angka userid dari link export Lentera
  ('telegram_chat_id',          ''),                                       -- kosongkan: terisi otomatis saat /start pertama
  ('study_start',               '08:00'),
  ('study_end',                 '22:00'),
  ('max_daily_minutes',         '300'),
  ('max_task_minutes_per_day',  '120'),
  ('block_max_minutes',         '90'),
  ('block_min_minutes',         '30'),
  ('break_minutes',             '15'),
  ('horizon_days',              '14'),
  ('deadline_buffer_minutes',   '120'),
  ('rest_days',                 ''),                                       -- mis. '0' = Minggu libur belajar
  ('busy_all_day',              'false'),
  ('semester_start',            ''),                                       -- mis. '2026-08-01': kelas Classroom yg dibuat sebelum ini diabaikan
  ('classroom_ignore',          ''),                                       -- nama kelas yg diabaikan, pisahkan koma
  ('tz_offset_minutes',         '420')                                     -- WIB
on conflict (key) do nothing;
