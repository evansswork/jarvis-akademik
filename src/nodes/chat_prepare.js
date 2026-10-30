// Siapkan teks untuk agent dari pesan Telegram. Perintah slash diterjemahkan
// jadi kalimat biasa supaya agent cukup punya satu jalur pemahaman.
const msg = $('Telegram Trigger').first().json.message || {};
const auth = $input.first().json;
let text = String(msg.text || msg.caption || '').trim();

if (!text) {
  text = '(User mengirim pesan non-teks. Jelaskan singkat bahwa untuk saat ini kamu hanya membaca pesan teks.)';
}
if (/^\/start\b/i.test(text)) {
  text = auth.just_registered
    ? 'Halo! Ini pertama kali aku pakai kamu. Perkenalkan diri singkat dan jelaskan apa saja yang bisa kamu bantu, termasuk contoh kalimat yang bisa kukirim.'
    : 'Halo! Ingatkan aku singkat apa saja yang bisa kamu bantu.';
} else if (/^\/sync\b/i.test(text)) {
  text = 'Sinkronkan tugas dari Lentera dan Classroom sekarang, lalu ringkas hasilnya.';
} else if (/^\/jadwal\b/i.test(text)) {
  text = 'Jadwal belajarku hari ini dan besok apa saja?';
} else if (/^\/tugas\b/i.test(text)) {
  text = 'Tampilkan tugasku yang belum selesai, urut dari deadline terdekat.';
} else if (/^\/susun\b/i.test(text)) {
  text = 'Susun ulang jadwal belajarku sekarang dan ringkas perubahannya.';
}

return [{ json: { chat_id: String(msg.chat.id), text } }];
