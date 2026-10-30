// Ujung cabang tool: kalau query tidak mengembalikan baris, beri tahu agent.
const items = $input.all().filter((x) => x.json && Object.keys(x.json).length > 0);
if (items.length === 0) {
  throw new Error('Data tidak ditemukan. Cek task_id dengan lihat_tugas.');
}
return items;
