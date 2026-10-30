# Jarvis Akademik — MVP

Agen AI di Telegram yang mencatat tugas, menjadwalkan blok belajar ke Google Calendar, lalu **menyusun ulang jadwal sendiri** saat rencana gagal. Tugas dibaca otomatis dari Lentera dan Google Classroom.

Semua jalan di **satu workflow n8n** (`workflows/jarvis-akademik.json`). Cukup import satu file, pasang kredensial, aktifkan.

```
Telegram ──► AI Agent (Gemini) ──► 10 tool ──► "Jarvis Tools" (satu pintu, divalidasi)
                                                 ├─ database tugas (Supabase)
                                                 ├─ penjadwal deterministik (EDF, anti-bentrok)
                                                 └─ Google Calendar "Jarvis Akademik"
06:30  sinkron Lentera + Classroom → susun ulang → pesan pagi
20:00  check-in malam → balasan "udah / belum, capek" → agent → susun ulang
```

## Isi folder

| Path | Isi |
| --- | --- |
| `workflows/jarvis-akademik.json` | **File yang di-import ke n8n** (hasil build, jangan diedit manual) |
| `database/schema.sql` | Tabel + pengaturan awal. Jalankan sekali di Supabase |
| `database/demo_seed.sql` | 5 tugas contoh untuk latihan demo (tanggal relatif) |
| `prompts/system-prompt.md` | System prompt agent |
| `src/lib/` | Logika inti: parser iCal, normalisasi Lentera/Classroom, **penjadwal** |
| `src/nodes/` | Isi tiap Code node |
| `src/sql/` | Query tiap node Postgres |
| `build/build-workflow.js` | Merakit semua di atas menjadi file workflow |
| `test/` | Unit test + test end-to-end |

## Setup (sekitar 45 menit)

### 1. Database (Supabase)
1. Buat project di supabase.com.
2. **SQL Editor → New query →** paste isi `database/schema.sql` **→ Run**.
3. Buka **Table Editor → settings**, isi 3 baris ini:
   - `main_calendar_id`: email Google kamu (kalender utama, isinya kuliah dan acara).
   - `jarvis_calendar_id`: ID kalender Jarvis (langkah 2).
   - `lentera_userid`: angka `userid` dari link export Lentera.

   - `semester_start`: tanggal mulai semester ini, misalnya `2026-08-01`. Kelas Classroom yang dibuat sebelum tanggal ini dianggap kelas lama dan diabaikan, meskipun belum di-archive dosen.

   `telegram_chat_id` biarkan kosong, nanti terisi otomatis. Kelas lama yang lolos filter tanggal bisa diabaikan lewat chat, misalnya `Basis Data udah selesai semester lalu`. Jarvis akan menambahkannya ke `classroom_ignore` dan membuang tugas lama dari kelas itu.

   Paket **Free** Supabase sudah cukup (500 MB, maksimal 2 project). Project gratis di-pause setelah 1 minggu tidak aktif. Jarvis membaca database setiap hari, jadi seharusnya tetap aktif. Kalau tetap ter-pause, klik **Restore** di dashboard Supabase.

### 2. Kalender khusus Jarvis
Di Google Calendar: **Other calendars → + → Create new calendar**, beri nama `Jarvis Akademik`. Buka **Settings → Integrate calendar**, lalu salin **Calendar ID** (formatnya `...@group.calendar.google.com`).

Jarvis hanya menghapus dan membuat event di kalender ini. Kalender utama hanya dibaca.

> ID kalender harus berbentuk email. Tulisan `primary` tidak bisa dipakai.

### 3. Kredensial di n8n (6 buah)
Buat dengan nama persis seperti di bawah supaya otomatis cocok saat import:

| Nama kredensial | Tipe di n8n | Cara isi |
| --- | --- | --- |
| `Jarvis Telegram Bot` | Telegram API | Token dari @BotFather (`/newbot`) |
| `Jarvis Supabase` | Postgres | Supabase → **Connect → Session pooler**: host, port, database `postgres`, user, password, SSL **require** |
| `Jarvis Google Calendar` | Google Calendar OAuth2 API | Client ID/Secret dari project Google Cloud yang sama dengan tes Classroom. Aktifkan **Google Calendar API** |
| `Jarvis Google Classroom` | Google OAuth2 API | Kredensial yang sudah lolos Tes 2. Scope: `https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly` |
| `Lentera iCal token` | Query Auth | Name `authtoken`, Value = nilai `authtoken` dari link export Lentera |
| `Gemini API` | Google Gemini (PaLM) API | API key gratis dari aistudio.google.com |

> Token Lentera hanya disimpan di kredensial ini, tidak ada di file workflow. Jangan commit link Lentera ke GitHub.

### 4. Import & aktifkan
1. n8n: **Workflows → Import from file →** pilih `workflows/jarvis-akademik.json`.
2. Buka node yang bertanda merah (kalau ada), lalu pilih kredensialnya.
3. **Save**, kemudian aktifkan workflow (toggle **Active / Publish**). Telegram Trigger hanya menerima pesan saat workflow aktif.
4. Kirim `/start` ke bot. Chat pertama otomatis menjadi pemilik, dan chat lain akan ditolak.

Kalau belum mau memakai Classroom, pilih tiga node `S: Classroom ...` lalu **Deactivate**. Sinkron tetap jalan dengan Lentera saja.

## Cara pakai

Chat biasa saja. Contoh:
- `ada tugas laporan praktikum Jarkom deadline Kamis, kira-kira 5 jam`
- `UTS Statistika tanggal 3 Nov jam 8 pagi`
- `minggu ini aku sakit, 3 hari ga bisa ngapa-ngapain`
- `jangan jadwalin di atas jam 9 malam`
- `besok aku ada apa aja?`

Perintah singkat: `/sync`, `/jadwal`, `/tugas`, `/susun`.

**Tool yang dimiliki agent:** `lihat_tugas`, `tambah_tugas`, `ubah_tugas`, `catat_progres`, `tandai_tidak_tersedia`, `hapus_tidak_tersedia`, `ubah_pengaturan`, `lihat_jadwal`, `susun_ulang_jadwal`, `sinkronkan_lentera_classroom`.

**Pembagian kerja AI dan kode:**
- **Agent (LLM)** memahami bahasa sehari-hari, memutuskan prioritas, bertanya balik kalau ambigu, minta konfirmasi untuk perubahan besar, dan memilih apa yang dikorbankan (menurunkan `target_pct`).
- **Penjadwal (`src/lib/scheduler.js`)** menghitung jam. Algoritmanya Earliest Deadline First, dengan jaminan: tidak bentrok dengan kalender utama maupun periode tidak tersedia, selalu di dalam jam belajar, selesai sebelum deadline dikurangi buffer, dan tidak melebihi batas menit per hari. Kalau waktunya tidak cukup, tugas dilaporkan sebagai `tidak_muat` beserta persen yang realistis.

## Latihan demo

1. Jalankan `database/demo_seed.sql` di Supabase.
2. Kirim `/susun` ke bot. Kalender Jarvis akan terisi.
3. Kirim `minggu ini aku sakit, 3 hari ga bisa ngapa-ngapain`. Jarvis bertanya balik atau meminta konfirmasi. Jawab `lanjut`, dan kalender tersusun ulang. Laporan praktikum (deadline 3 hari lagi) akan dilaporkan tidak muat penuh.
4. Untuk check-in tanpa menunggu jam 20:00: buka node **Tiap malam 20:00**, klik **Execute workflow**. Lalu balas `belum, capek`.
5. Untuk pesan pagi: execute node **Tiap pagi 06:30**.

Sehari sebelum demo, login ulang kredensial Google. Selama aplikasi OAuth berstatus Testing, Google biasanya membuat token kedaluwarsa sekitar 7 hari.

## Untuk developer (review kode)

```bash
node build/build-workflow.js        # rakit ulang workflow setelah mengubah src/ atau prompts/
node --test test/                   # unit test (tanpa database)
JARVIS_PG="-h localhost -p 5432 -U postgres -d jarvis_test" node --test test/   # + test end-to-end ke Postgres
```

- Edit logika di `src/`, bukan di n8n. Kalau terlanjur mengedit di n8n, salin perubahannya kembali ke `src/` lalu build ulang.
- Test end-to-end menjalankan Code node dan query SQL asli dari file workflow, termasuk cara node Postgres n8n menyisipkan parameter. Hanya Google API dan Telegram yang dipalsukan.
