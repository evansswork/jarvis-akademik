// Pesan check-in malam. Disimpan juga ke memori agent agar balasan user
// ("udah", "belum, capek") langsung dipahami konteksnya.
const d = $input.first().json;
if (!d.chat_id) throw new Error('telegram_chat_id kosong: kirim /start ke bot dulu.');
const L = ['🌙 Check-in malam'];
if (d.today_blocks.length) {
  L.push('', 'Rencana belajar hari ini:');
  for (const b of d.today_blocks) L.push(`• ${b.jam} ${b.course ? `${b.course}: ` : ''}${b.title} [#${b.task_id}]`);
  L.push('', 'Mana yang sudah dikerjakan? Jawab bebas aja, misal "Statistik udah, Jarkom baru setengah" atau "belum, capek".');
} else {
  L.push('', 'Hari ini tidak ada blok belajar terjadwal.');
}
if (d.due_soon.length) {
  L.push('', '⏳ Deadline 3 hari ke depan:');
  for (const t of d.due_soon.slice(0, 6)) L.push(`• ${t.course ? `${t.course}: ` : ''}${t.title} — ${t.deadline_wib}`);
}
if (d.tomorrow_blocks.length) {
  L.push('', 'Besok:');
  for (const b of d.tomorrow_blocks.slice(0, 6)) L.push(`• ${b.jam} ${b.course ? `${b.course}: ` : ''}${b.title}`);
}
const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = L.join('\n');
return [{ json: { chat_id: String(d.chat_id), text: escHtml(plain), plain } }];
