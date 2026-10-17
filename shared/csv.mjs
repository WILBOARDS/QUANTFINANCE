/* Ekspor CSV yang aman dibuka di Excel/LibreOffice/Google Sheets.
   Judul berita dan nama dari pihak ketiga bisa berisi rumus (=HYPERLINK(...), +cmd, @SUM).
   Teks yang diawali = + - @ tab atau CR diberi awalan ' supaya dibaca sebagai teks, bukan rumus.
   Angka asli (termasuk negatif) tidak diubah. */
const FORMULA_START = /^[=+\-@\t\r]/;
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (FORMULA_START.test(s) && !(/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rows) {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
