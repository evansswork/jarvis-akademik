-- ===========================================================================
-- Data contoh untuk latihan demo. Tanggal relatif terhadap waktu dijalankan,
-- jadi bisa dipakai kapan saja. Jalankan SETELAH schema.sql.
-- Untuk mengosongkan lagi:  truncate tasks, unavailability, study_blocks, checkins restart identity cascade;
-- ===========================================================================
insert into tasks (source, course, title, task_type, deadline, effort_minutes, weight) values
  ('manual', 'Jaringan Komputer', 'Laporan praktikum modul 3', 'tugas',
     date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' + interval '3 day 23 hour 59 minute', 300, 3),
  ('manual', 'Statistika', 'Latihan soal Bab 3', 'tugas',
     date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' + interval '2 day 23 hour 59 minute', 120, 2),
  ('manual', 'Basis Data', 'Tugas normalisasi', 'tugas',
     date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' + interval '6 day 23 hour 59 minute', 180, 2),
  ('manual', 'Sistem Terdistribusi', 'Quiz08 Fault Tolerance', 'kuis',
     date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' + interval '4 day 23 hour 59 minute', 45, 2),
  ('manual', 'Statistika', 'UTS Statistika', 'ujian',
     date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' + interval '9 day 8 hour', 480, 3);
