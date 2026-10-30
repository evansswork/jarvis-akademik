// Pesan pagi setelah sinkronisasi + susun ulang.
const s = $input.first().json;
if (!s.telegram_chat_id) throw new Error('telegram_chat_id kosong: kirim /start ke bot dulu.');
const L = ['☀️ Selamat pagi! Ini rencana belajarmu.'];
const sync = s.sinkronisasi;
if (sync && sync.tugas_baru.length) {
  L.push('', `📥 Tugas baru (${sync.tugas_baru.length}):`);
  for (const t of sync.tugas_baru.slice(0, 8)) L.push(`• ${t.course ? `${t.course}: ` : ''}${t.title} — ${t.deadline_wib || 'tanpa deadline'}`);
}
L.push('', s.blok_hari_ini.length ? '📅 Hari ini:' : '📅 Hari ini tidak ada blok belajar.');
for (const b of s.blok_hari_ini) L.push(`• ${b}`);
if (s.tidak_muat.length) {
  L.push('', '⚠️ Tidak cukup waktu:');
  for (const x of s.tidak_muat.slice(0, 5)) L.push(`• ${x.tugas} — realistis ${x.realistis_persen}% sebelum ${x.deadline}`);
  L.push('Balas pesan ini kalau mau aku atur prioritasnya.');
}
if (s.hari_padat.length) L.push('', `🔥 Hari padat: ${s.hari_padat.join(', ')}`);
if (s.lewat_deadline.length) L.push('', `⏰ ${s.lewat_deadline.length} tugas sudah lewat deadline. Sudah dikumpulkan? Kabari ya.`);
if (sync && sync.peringatan && sync.peringatan.length) L.push('', `ℹ️ ${sync.peringatan.join(' | ')}`);
const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = L.join('\n');
return [{ json: { chat_id: s.telegram_chat_id, text: escHtml(plain), plain } }];
