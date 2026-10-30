// Emulator kecil untuk menjalankan Code node dari workflow hasil build,
// plus runner SQL ke Postgres sungguhan (via psql). Dipakai test E2E.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WF = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflows', 'jarvis-akademik.json'), 'utf8'));
const byName = Object.fromEntries(WF.nodes.map((n) => [n.name, n]));

function wrapItems(arr) {
  return arr.map((json) => ({ json }));
}

function accessor(items, executed = true) {
  return {
    first: () => items[0],
    last: () => items[items.length - 1],
    all: () => items,
    item: items[0],
    isExecuted: executed,
  };
}

/**
 * Jalankan Code node `name`.
 * @param input   array json item input
 * @param outputs { 'Nama Node': [json, ...] } output node lain yang dirujuk via $('...')
 */
async function runCode(name, input, outputs = {}) {
  const node = byName[name];
  if (!node || node.type !== 'n8n-nodes-base.code') throw new Error(`Bukan Code node: ${name}`);
  const inputItems = wrapItems(input);
  const $ = (n) => {
    if (!(n in outputs)) {
      if (!byName[n]) throw new Error(`Node "${n}" tidak ada di workflow`);
      return accessor([], false);
    }
    return accessor(wrapItems(outputs[n]));
  };
  // executeOnce: n8n memotong input menjadi item pertama saja.
  const $input = accessor(node.executeOnce ? inputItems.slice(0, 1) : inputItems);
  // eslint-disable-next-line no-new-func
  const fn = new Function('$input', '$', '$json', 'console', `return (async () => {\n${node.parameters.jsCode}\n})();`);
  let result = await fn($input, $, inputItems[0] ? inputItems[0].json : {}, console);
  if ((!result || result.length === 0) && node.alwaysOutputData) result = [{ json: {} }];
  return (result || []).map((x) => x.json);
}

// ---------------------------------------------------------------- SQL -----
const PG = process.env.JARVIS_PG; // mis. "-h /path -p 54329 -U postgres -d jarvis_test"

// Meniru pg-promise (dipakai node Postgres n8n): parameter disisipkan di sisi
// klien sebagai literal, termasuk $n yang ada di dalam komentar SQL.
function literal(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `'${text.replace(/'/g, "''")}'`;
}

function formatLikePgPromise(query, params) {
  return query.replace(/\$(\d+)/g, (m, n) => {
    const i = Number(n) - 1;
    if (i >= params.length) throw new Error(`Parameter ${m} tidak ada`);
    return literal(params[i]);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function convert(v) {
  if (v === '') return null;
  if (v === 't') return true;
  if (v === 'f') return false;
  if (/^[[{]/.test(v)) return JSON.parse(v);
  return v; // angka bigint dibiarkan string, sama seperti node-postgres
}

/** Jalankan file SQL dari src/sql dengan parameter, kembalikan baris JSON. */
function runSql(sqlName, params = []) {
  if (!PG) throw new Error('JARVIS_PG belum diset');
  const node = WF.nodes.find((n) => n.type === 'n8n-nodes-base.postgres' && n.parameters.query.trim() === fs.readFileSync(path.join(__dirname, '..', 'src', 'sql', `${sqlName}.sql`), 'utf8').trim());
  if (!node) throw new Error(`Query ${sqlName} tidak dipakai di workflow`);
  const q = node.parameters.query.replace(/;\s*$/, '');
  const cmds = ['-c', params.length ? formatLikePgPromise(q, params) : q];
  const out = execFileSync('psql', [...PG.split(' '), '-v', 'ON_ERROR_STOP=1', '-X', '-q', '--csv', ...cmds], { encoding: 'utf8' });
  const rows = parseCsv(out.trim());
  if (rows.length === 0) return [];
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, convert(r[i])])));
}

function psql(sqlText) {
  return execFileSync('psql', [...PG.split(' '), '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-c', sqlText], { encoding: 'utf8' });
}

module.exports = { WF, byName, runCode, runSql, psql };
