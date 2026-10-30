// Memuat file lib persis seperti nanti di-inline ke Code node n8n:
// semua file digabung jadi satu script lalu dijalankan di sandbox vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LIB_DIR = path.join(__dirname, '..', 'src', 'lib');

function loadLib(files) {
  const code = files.map((f) => fs.readFileSync(path.join(LIB_DIR, f), 'utf8')).join('\n');
  const sandbox = { console, Date, Math, JSON, Number, String, Object, Array, Map, Set, Infinity };
  vm.createContext(sandbox);
  // Ekspor semua deklarasi top-level ke objek hasil.
  const names = [...code.matchAll(/^(?:function|const)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  vm.runInContext(`${code}\n;globalThis.__lib = { ${names.join(', ')} };`, sandbox);
  return sandbox.__lib;
}

module.exports = { loadLib, LIB_DIR };
