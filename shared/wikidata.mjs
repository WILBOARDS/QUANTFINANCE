/* =====================================================================
   WIKIDATA (murni, tanpa import; diuji di test/wikidata.test.mjs)
   Fakta PUBLIK tentang peran tokoh dan perusahaan dari Wikidata (CC0).
   Privasi ditegakkan di kode, dua lapis:
   1. ALLOW: hanya properti yang ada di daftar ini yang pernah dibaca.
   2. BLOCK: properti data pribadi (tanggal/tempat lahir, keluarga, alamat, telepon, email, foto,
      agama, etnis, orientasi, kesehatan, dll.) dibuang walaupun ada yang menambahkannya ke ALLOW.
   Tes memastikan tidak ada properti BLOCK yang lolos ke hasil, dari data apa pun.
   ===================================================================== */

export const BLOCK = new Set([
  'P569', 'P570', 'P19', 'P20', 'P509', 'P1196', 'P157',                 // lahir, wafat, tempat, sebab
  'P26', 'P40', 'P22', 'P25', 'P3373', 'P1038', 'P451', 'P3448', 'P1290', // keluarga & pasangan
  'P551', 'P6375', 'P281', 'P1329', 'P968', 'P2002', 'P2013', 'P2003',    // tempat tinggal, alamat, telepon, email, akun pribadi
  'P18', 'P109', 'P1442', 'P1801', 'P2910', 'P6500',                      // gambar, tanda tangan, makam
  'P21', 'P91', 'P140', 'P172', 'P1142', 'P102',                          // gender, orientasi, agama, etnis, ideologi, partai
  'P2048', 'P2067', 'P1050', 'P1340', 'P1971', 'P69',                     // tinggi, berat, penyakit, mata, jumlah anak, sekolah
]);
/* properti yang boleh tampil: [label Indonesia, jenis nilai] */
export const ALLOW = {
  P31: ['jenis', 'item'],
  P106: ['pekerjaan', 'item'],
  P39: ['jabatan publik', 'item'],
  P108: ['pemberi kerja', 'item'],
  P27: ['kewarganegaraan', 'item'],
  P856: ['situs resmi', 'url'],
  P169: ['CEO', 'item'],
  P488: ['ketua', 'item'],
  P112: ['pendiri', 'item'],
  P1037: ['direktur / manajer', 'item'],
  P3320: ['anggota dewan', 'item'],
  P249: ['kode saham', 'string'],
  P414: ['bursa', 'item'],
  P452: ['industri', 'item'],
  P159: ['kantor pusat', 'item'],
  P17: ['negara', 'item'],
  P571: ['didirikan', 'time'],
  P1128: ['jumlah karyawan', 'quantity'],
};
/* kualifier yang boleh dibaca: mulai, selesai, titik waktu, jabatan (untuk P108/P3320), bursa (untuk P249) */
const QUAL = { P580: 'mulai', P582: 'selesai', P585: 'per', P39: 'jabatan', P414: 'bursa', P463: 'anggota' };
export const QID_RE = /^Q[1-9]\d{0,9}$/;
export const isAllowed = pid => Object.prototype.hasOwnProperty.call(ALLOW, pid) && !BLOCK.has(pid);

/* waktu Wikidata "+2014-02-04T00:00:00Z" presisi 9 (tahun) / 10 (bulan) / 11 (hari) -> "2014" / "2014-02" / "2014-02-04" */
export function wdTime(v) {
  if (!v || typeof v.time !== 'string') return null;
  const m = /^([+-])(\d{1,16})-(\d{2})-(\d{2})T/.exec(v.time);
  if (!m) return null;
  const y = (m[1] === '-' ? '-' : '') + m[2].replace(/^0+(?=\d{4})/, '');
  const p = v.precision;
  return p >= 11 ? `${y}-${m[3]}-${m[4]}` : p === 10 ? `${y}-${m[3]}` : p === 9 ? y : p === 8 ? y.slice(0, -1) + '0-an' : y;
}
function snakValue(snak, kind) {
  if (!snak || snak.snaktype !== 'value' || !snak.datavalue) return null;
  const v = snak.datavalue.value;
  switch (kind) {
    case 'item': return v && QID_RE.test(v.id) ? { qid: v.id } : null;
    case 'url': return typeof v === 'string' && /^https?:\/\//i.test(v) ? { url: v } : null;
    case 'string': return typeof v === 'string' ? { text: v.slice(0, 40) } : null;
    case 'time': { const t = wdTime(v); return t ? { text: t } : null; }
    case 'quantity': { const n = v && Number(v.amount); return Number.isFinite(n) ? { num: n } : null; }
    default: return null;
  }
}
/* satu entitas wbgetentities -> { qid, label, description, facts: [{ pid, prop, value, qualifiers, rank }] } */
export function parseEntity(ent, lang = ['id', 'en']) {
  if (!ent || !QID_RE.test(ent.id || '')) throw new Error('Entitas Wikidata tidak dikenal');
  const pick = o => { for (const l of lang) if (o && o[l] && o[l].value) return o[l].value; return ''; };
  const facts = [];
  for (const [pid, claims] of Object.entries(ent.claims || {})) {
    if (!isAllowed(pid) || !Array.isArray(claims)) continue;
    const kind = ALLOW[pid][1];
    for (const c of claims) {
      if (!c || c.rank === 'deprecated') continue;
      const value = snakValue(c.mainsnak, kind);
      if (!value) continue;
      const qualifiers = {};
      for (const [qp, list] of Object.entries(c.qualifiers || {})) {
        if (!QUAL[qp] || BLOCK.has(qp) || !Array.isArray(list)) continue;
        const qs = list[0];
        const qv = qp === 'P580' || qp === 'P582' || qp === 'P585' ? snakValue(qs, 'time') : snakValue(qs, 'item');
        if (qv) qualifiers[QUAL[qp]] = qv;
      }
      facts.push({ pid, prop: ALLOW[pid][0], value, qualifiers, rank: c.rank || 'normal' });
    }
  }
  /* "sekarang" duluan: yang belum selesai, lalu yang paling baru mulai */
  facts.sort((a, b) => (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0) || (a.qualifiers.selesai ? 1 : 0) - (b.qualifiers.selesai ? 1 : 0) || String((b.qualifiers.mulai || {}).text || '').localeCompare(String((a.qualifiers.mulai || {}).text || '')));
  return { qid: ent.id, label: pick(ent.labels), description: pick(ent.descriptions), facts, modified: typeof ent.modified === 'string' ? ent.modified : null, enwiki: ent.sitelinks && ent.sitelinks.enwiki ? ent.sitelinks.enwiki.title : null };
}
/* QID yang perlu label (nilai + kualifier item) */
export function referencedQids(parsed) {
  const s = new Set();
  for (const f of parsed.facts) {
    if (f.value.qid) s.add(f.value.qid);
    for (const q of Object.values(f.qualifiers)) if (q.qid) s.add(q.qid);
  }
  return [...s].slice(0, 50);
}
/* wbgetentities props=labels -> { Q: label } */
export function parseLabels(raw, lang = ['id', 'en']) {
  const out = {};
  for (const [id, e] of Object.entries((raw && raw.entities) || {})) {
    if (!QID_RE.test(id) || !e || !e.labels) continue;
    for (const l of lang) if (e.labels[l] && e.labels[l].value) { out[id] = e.labels[l].value; break; }
  }
  return out;
}
/* wbsearchentities -> [{ qid, label, description }] */
export function parseSearch(raw) {
  if (!raw || !Array.isArray(raw.search)) throw new Error('Format pencarian Wikidata tidak dikenal');
  return raw.search.filter(x => x && QID_RE.test(x.id)).slice(0, 10).map(x => ({ qid: x.id, label: String(x.label || x.id).slice(0, 120), description: String(x.description || '').slice(0, 200) }));
}
/* jenis entitas dari P31: manusia (Q5) atau organisasi/perusahaan */
export const isHuman = parsed => parsed.facts.some(f => f.pid === 'P31' && f.value.qid === 'Q5');
export const COMPANY_ROLES = ['P169', 'P488', 'P112', 'P1037', 'P3320'];
export const PERSON_ROLES = ['P39', 'P108', 'P106', 'P27', 'P856'];
