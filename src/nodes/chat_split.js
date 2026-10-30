// Telegram membatasi 4096 karakter per pesan: potong per baris bila perlu.
// Format Markdown dibuang; teks di-escape karena dikirim dengan parse_mode HTML.
const raw = String($input.first().json.output || 'Maaf, aku belum punya jawaban untuk itu.');
const text = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#+\s*/gm, '');
const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LIMIT = 3500; // sisakan ruang untuk escape HTML
const chunks = [];
let rest = text;
while (rest.length > LIMIT) {
  let cut = rest.lastIndexOf('\n', LIMIT);
  if (cut < LIMIT / 4) cut = LIMIT;
  chunks.push(rest.slice(0, cut));
  rest = rest.slice(cut).replace(/^\n/, '');
}
chunks.push(rest);
const chatId = $('Siapkan pesan').first().json.chat_id;
return chunks.filter((c) => c.trim()).map((c) => ({ json: { chat_id: chatId, text: escHtml(c) } }));
