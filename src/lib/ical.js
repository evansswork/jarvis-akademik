// ---------------------------------------------------------------------------
// lib/ical.js — parser iCalendar (.ics) minimal untuk export kalender Moodle
// (Lentera). Tanpa library eksternal supaya jalan di n8n Cloud.
// Menangani: baris terlipat (RFC 5545), escape teks, DTSTART UTC/DATE/TZID.
// ---------------------------------------------------------------------------

/** Satukan baris yang terlipat: baris yang diawali spasi/tab adalah lanjutan. */
function icsUnfold(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');
}

function icsUnescape(v) {
  return String(v)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Ubah nilai DTSTART/DTEND menjadi Date.
 *  - 20261018T170000Z           -> UTC
 *  - 20261020 (VALUE=DATE)      -> 00:00 lokal
 *  - 20261020T090000 (TZID/...) -> dianggap jam lokal
 */
function icsParseDate(value, params, offsetMin) {
  const v = String(value || '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(v);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offsetMin * 60000);
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - offsetMin * 60000);
  return null;
}

/** Parse teks .ics menjadi daftar event. */
function parseICS(text, offsetMin = 420) {
  const lines = icsUnfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = left.split(';');
    const params = {};
    for (const p of paramParts) {
      const [k, val] = p.split('=');
      params[String(k).toUpperCase()] = val;
    }
    switch (name.toUpperCase()) {
      case 'UID': cur.uid = value.trim(); break;
      case 'SUMMARY': cur.summary = icsUnescape(value); break;
      case 'DESCRIPTION': cur.description = icsUnescape(value); break;
      case 'CATEGORIES': cur.categories = icsUnescape(value); break;
      case 'DTSTART': cur.start = icsParseDate(value, params, offsetMin); break;
      case 'DTEND': cur.end = icsParseDate(value, params, offsetMin); break;
      default: break;
    }
  }
  return events;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { icsUnfold, icsUnescape, icsParseDate, parseICS };
}
