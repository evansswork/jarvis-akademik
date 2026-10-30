// ---------------------------------------------------------------------------
// lib/validate.js — helper validasi input tool agent.
// ---------------------------------------------------------------------------
function vStr(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}
function vIso(v, field) {
  const s = vStr(v);
  if (!s) return '';
  if (Number.isNaN(Date.parse(s))) {
    throw new Error(`${field} "${s}" bukan tanggal ISO 8601 yang valid. Contoh: 2026-10-24T23:59:00+07:00`);
  }
  return new Date(s).toISOString();
}
function vInt(v, field, min, max) {
  const s = vStr(v);
  if (!s) return null;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${field} harus angka ${min}-${max}, dapat "${s}"`);
  return n;
}
function vBool(v) {
  return ['true', 'ya', 'yes', '1', 'selesai', 'sudah'].includes(vStr(v).toLowerCase());
}
