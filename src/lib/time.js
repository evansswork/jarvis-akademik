// ---------------------------------------------------------------------------
// lib/time.js — helper waktu. Indonesia tidak memakai DST, jadi zona waktu
// cukup dinyatakan sebagai offset tetap (WIB = +420 menit).
// ---------------------------------------------------------------------------

const MS_MIN = 60 * 1000;
const MS_DAY = 24 * 60 * MS_MIN;
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Komponen tanggal/jam lokal dari sebuah Date (UTC) + offset menit. */
function localParts(date, offsetMin) {
  const d = new Date(date.getTime() + offsetMin * MS_MIN);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

/** Date (UTC) dari tanggal + jam lokal. */
function localToDate(y, m, d, hh, mm, offsetMin) {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - offsetMin * MS_MIN);
}

/** Awal hari lokal (00:00) untuk tanggal tertentu, sebagai Date UTC. */
function startOfLocalDay(date, offsetMin) {
  const p = localParts(date, offsetMin);
  return localToDate(p.y, p.m, p.d, 0, 0, offsetMin);
}

/** "08:30" -> 510 menit. */
function parseHHMM(s, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Kunci tanggal lokal "2026-10-23". */
function localDateKey(date, offsetMin) {
  const p = localParts(date, offsetMin);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** ISO dengan offset lokal: "2026-10-23T09:00:00+07:00". */
function isoLocal(date, offsetMin) {
  const p = localParts(date, offsetMin);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}T${pad2(p.hh)}:${pad2(p.mm)}:00${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** "Kam 23 Okt 09:00" */
function fmtLocal(date, offsetMin, withTime = true) {
  const p = localParts(date, offsetMin);
  const base = `${HARI[p.dow]} ${p.d} ${BULAN[p.m - 1]}`;
  return withTime ? `${base} ${pad2(p.hh)}:${pad2(p.mm)}` : base;
}

/** "09:00" */
function fmtClock(date, offsetMin) {
  const p = localParts(date, offsetMin);
  return `${pad2(p.hh)}:${pad2(p.mm)}`;
}

/** Bulatkan ke atas ke kelipatan `step` menit. */
function ceilToStep(date, stepMin) {
  const step = stepMin * MS_MIN;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MS_MIN, MS_DAY, HARI, BULAN, pad2, localParts, localToDate, startOfLocalDay,
    parseHHMM, localDateKey, isoLocal, fmtLocal, fmtClock, ceilToStep,
  };
}
