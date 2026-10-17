/* =====================================================================
   PERINGKAT & PENGGABUNGAN BERITA (murni, tanpa import; diuji di test/newsrank.test.mjs)
   - normalizeTitle: huruf kecil, tanpa tanda baca/aksen, tanpa akhiran " - Nama Media".
   - similarity: kemiripan Jaccard antar kata bermakna (kata umum dibuang).
   - dedupe: judul yang hampir sama digabung; yang PALING AWAL dipertahankan, sisanya
     dicatat sebagai "sumber lain" (bukan dihapus diam-diam).
   - breaking: judul dalam 2 jam terakhir, urut waktu terbaru.
   - queryFor: teks bebas pengguna -> kueri GDELT yang aman (hanya huruf/angka/spasi/tanda hubung).
   Tema/sentimen/dampak dihitung di Analytics (heuristik kata kunci) dan tetap berlabel
   "Analisis otomatis"; modul ini tidak menilai isi berita.
   ===================================================================== */

const STOP = new Set(('a an the of to in on for and or but with at by from as is are was were be been it its this that these those after before over under amid into than about up down out new says said say will may could would should has have had not no his her their our your more most').split(' '));

/* GDELT seendate "20261007T120000Z" atau ISO -> ms; tidak dikenal -> NaN */
export function timeOf(seen) {
  if (typeof seen === 'number') return seen;
  const s = String(seen || '');
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

export function normalizeTitle(t) {
  let s = String(t || '');
  /* akhiran nama media: "Judul - Reuters", "Judul | CNBC" (hanya bila pendek, supaya isi judul tidak terpotong) */
  s = s.replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/, '');
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'`]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function tokens(t) {
  return [...new Set(normalizeTitle(t).split(' ').filter(w => w.length > 1 && !STOP.has(w)))];
}
/* Jaccard: |A ∩ B| ÷ |A ∪ B|, 0..1. Judul kosong -> 0. */
export function similarity(a, b) {
  const A = Array.isArray(a) ? a : tokens(a), B = Array.isArray(b) ? b : tokens(b);
  if (!A.length || !B.length) return 0;
  const sb = new Set(B);
  let inter = 0;
  for (const w of A) if (sb.has(w)) inter++;
  return inter / (A.length + B.length - inter);
}

/* list: [{ title, url, domain, seen, ... }]. Hasil: salinan item paling awal per kelompok,
   dengan dupes: [{ title, url, domain, seen }] (urut waktu). threshold bawaan 0,6. */
export function dedupe(list, { threshold = 0.6 } = {}) {
  const items = (list || []).map((n, i) => ({ n, i, t: timeOf(n.seen), k: tokens(n.title) }));
  /* yang paling awal dulu, supaya ia yang jadi wakil kelompok */
  items.sort((a, b) => (Number.isFinite(a.t) ? a.t : Infinity) - (Number.isFinite(b.t) ? b.t : Infinity) || a.i - b.i);
  const groups = [];
  for (const it of items) {
    const norm = it.k.join(' ');
    let g = null;
    for (const x of groups) {
      if ((norm && x.norm === norm) || similarity(it.k, x.k) >= threshold) { g = x; break; }
    }
    if (g) g.dupes.push(it.n);
    else groups.push({ head: it.n, k: it.k, norm, dupes: [] });
  }
  return groups.map(g => ({ ...g.head, dupes: g.dupes.map(d => ({ title: d.title, url: d.url, domain: d.domain, seen: d.seen })) }));
}

/* berita "breaking": seen dalam windowMs terakhir (bawaan 2 jam), terbaru dulu */
export function breaking(list, now = Date.now(), windowMs = 2 * 3600e3) {
  return (list || []).filter(n => { const t = timeOf(n.seen); return Number.isFinite(t) && t <= now + 5 * 60e3 && now - t <= windowMs; })
    .sort((a, b) => timeOf(b.seen) - timeOf(a.seen));
}

/* urutan: 'time' (terbaru), 'impact' (skor dampak heuristik, seri -> terbaru) */
export function sortNews(list, mode = 'time') {
  const out = (list || []).slice();
  const t = n => { const x = timeOf(n.seen); return Number.isFinite(x) ? x : -Infinity; };
  if (mode === 'impact') out.sort((a, b) => ((b.a && b.a.impact) || 0) - ((a.a && a.a.impact) || 0) || t(b) - t(a));
  else out.sort((a, b) => t(b) - t(a));
  return out;
}

/* saringan: { theme, country, domain, spec, text } (kosong = semua) */
export function filterNews(list, f = {}) {
  const q = String(f.text || '').trim().toLowerCase();
  return (list || []).filter(n => {
    if (f.theme && !(n.a && n.a.themes && n.a.themes.some(t => t.id === f.theme))) return false;
    if (f.country && n.srcCountry !== f.country) return false;
    if (f.domain && n.domain !== f.domain) return false;
    if (f.spec && !(n.a && n.a.speculative)) return false;
    if (q && !(String(n.title) + ' ' + n.domain + ' ' + (n.srcCountry || '')).toLowerCase().includes(q)) return false;
    return true;
  });
}
/* daftar pilihan saringan dari data yang ada: [[nilai, jumlah]] urut jumlah */
export function facet(list, fn) {
  const m = new Map();
  for (const n of list || []) for (const v of [].concat(fn(n) || [])) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

/* teks bebas -> kueri GDELT. Hanya huruf (termasuk aksen), angka, spasi, tanda hubung.
   Satu kata: apa adanya (GDELT menolak kata < 3 huruf). Beberapa kata: frasa dalam tanda kutip.
   Hasil null bila tidak ada yang bisa dicari. */
export function queryFor(text) {
  const clean = String(text || '').normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) return null;
  const words = clean.split(' ').filter(Boolean);
  if (words.length === 1) return words[0].length >= 3 ? words[0] : null;
  return '"' + clean + '"';
}
