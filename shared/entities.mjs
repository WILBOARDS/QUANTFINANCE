/* =====================================================================
   REGISTRI ENTITAS + MESIN PENCARIAN
   Satu tempat untuk semua "benda" yang bisa dicari: saham, ETF, indeks, kripto,
   valas, komoditas, suku bunga/obligasi, negara, perusahaan, tokoh, topik berita,
   bank sentral, chokepoint, indikator. Data di sini hanya REFERENSI (kode, nama,
   pemetaan ke penyedia data), bukan harga.
   Registri bisa diperluas: add()/addMany() kapan saja (mis. hasil pencarian Wikipedia
   atau daftar ticker SEC dari server).
   ===================================================================== */

export const ENTITY_TYPES = {
  stock: 'Saham', etf: 'ETF', index: 'Indeks', crypto: 'Kripto', fx: 'Valas', commodity: 'Komoditas',
  rate: 'Suku bunga / obligasi', country: 'Negara', company: 'Perusahaan', person: 'Tokoh',
  topic: 'Topik berita', central_bank: 'Bank sentral', chokepoint: 'Chokepoint', indicator: 'Indikator',
};
/* urutan saat skor sama: yang paling sering dicari trader di atas */
const TYPE_RANK = { stock: 0, crypto: 1, index: 2, etf: 3, fx: 4, commodity: 5, rate: 6, country: 7, company: 8, person: 9, central_bank: 10, indicator: 11, topic: 12, chokepoint: 13 };

/* huruf besar, tanpa aksen, tanda baca jadi spasi (kecuali & . - yang dipakai di kode saham) */
export function normalize(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9&.\-^= ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const compact = s => normalize(s).replace(/[\s.\-^=]/g, '');

/* jarak edit kecil (Levenshtein dengan batas) untuk toleransi salah ketik */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function validateEntity(e) {
  if (!e || typeof e !== 'object') throw new Error('Entitas harus objek');
  if (!e.id || typeof e.id !== 'string') throw new Error('Entitas butuh id');
  if (!ENTITY_TYPES[e.type]) throw new Error(`Tipe entitas tidak dikenal: ${e.type} (${e.id})`);
  if (!e.name) throw new Error(`Entitas ${e.id} butuh name`);
  return true;
}

export function createRegistry(initial = []) {
  const byId = new Map();
  const listeners = new Set();

  function keysOf(e) {
    const sym = e.symbol ? normalize(e.symbol) : '';
    const aliases = (e.aliases || []).map(normalize).filter(Boolean);
    const name = normalize(e.name);
    const words = name.split(' ').filter(w => w.length > 1);
    return { sym, symC: compact(e.symbol || ''), aliases, aliasC: aliases.map(a => a.replace(/[\s.\-^=]/g, '')), name, words };
  }
  function add(e, { silent = false } = {}) {
    validateEntity(e);
    const prev = byId.get(e.id);
    const merged = prev ? { ...prev, ...e, aliases: [...new Set([...(prev.aliases || []), ...(e.aliases || [])])], providers: { ...(prev.providers || {}), ...(e.providers || {}) } } : { ...e };
    merged._k = keysOf(merged);
    byId.set(e.id, merged);
    if (!silent) listeners.forEach(f => f(merged));
    return merged;
  }
  function addMany(list) { for (const e of list) add(e, { silent: true }); listeners.forEach(f => f(null)); }
  for (const e of initial) add(e, { silent: true });

  function score(e, q, qc, qWords) {
    const k = e._k;
    let s = 0, how = '';
    const set = (v, h) => { if (v > s) { s = v; how = h; } };
    if (k.sym && (k.sym === q || k.symC === qc)) set(100, 'kode');
    if (k.aliases.includes(q) || k.aliasC.includes(qc)) set(96, 'alias');
    if (k.name === q) set(94, 'nama');
    if (k.sym && k.sym.startsWith(q)) set(82 - Math.min(10, k.sym.length - q.length), 'awal kode');
    if (k.aliases.some(a => a.startsWith(q))) set(76, 'awal alias');
    if (k.name.startsWith(q)) set(72, 'awal nama');
    if (qWords.length > 1 && qWords.every(w => k.words.some(x => x.startsWith(w)))) set(70, 'kata nama');
    if (q.length >= 2 && k.words.some(w => w.startsWith(q))) set(62, 'kata nama');
    if (q.length >= 3 && k.name.includes(q)) set(46, 'bagian nama');
    if (q.length >= 4 && !s) {
      const d = Math.min(...[k.sym, ...k.words, ...k.aliases].filter(x => x && x.length >= 4).map(x => editDistance(q, x, 1)), 2);
      if (d <= 1) set(36, 'mirip');
    }
    if (!s) return null;
    return { entity: e, score: s + Math.min(5, e.weight || 0) - (TYPE_RANK[e.type] ?? 20) * 0.05, matched: how };
  }

  return {
    types: ENTITY_TYPES,
    add, addMany,
    get: id => byId.get(id) || null,
    all: () => [...byId.values()],
    size: () => byId.size,
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    /* cocok persis (kode, alias, atau nama) -> dipakai parser perintah. Bisa dibatasi tipe. */
    resolve(token, types) {
      const q = normalize(token), qc = compact(token);
      if (!q) return null;
      let best = null;
      for (const e of byId.values()) {
        if (types && !types.includes(e.type)) continue;
        const k = e._k;
        let s = 0;
        if (k.sym === q || (k.symC && k.symC === qc)) s = 3;
        else if (k.aliases.includes(q) || k.aliasC.includes(qc)) s = 2;
        else if (k.name === q) s = 1;
        if (!s) continue;
        const rank = s * 100 - (TYPE_RANK[e.type] ?? 20) + Math.min(5, e.weight || 0);
        if (!best || rank > best.rank) best = { e, rank };
      }
      return best ? best.e : null;
    },
    bySymbol(sym, type) {
      const q = normalize(sym);
      for (const e of byId.values()) if (e._k.sym === q && (!type || e.type === type)) return e;
      return null;
    },
    find(pred) { for (const e of byId.values()) if (pred(e)) return e; return null; },
    search(query, { limit = 30, types } = {}) {
      const q = normalize(query);
      if (!q) return [];
      const qc = compact(query), qWords = q.split(' ').filter(Boolean);
      const out = [];
      for (const e of byId.values()) {
        if (types && !types.includes(e.type)) continue;
        const r = score(e, q, qc, qWords);
        if (r) out.push(r);
      }
      out.sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
      return out.slice(0, limit);
    },
    /* hasil dikelompokkan per tipe, urutan kelompok mengikuti skor terbaik di kelompok itu */
    searchGrouped(query, opts = {}) {
      const res = this.search(query, { limit: opts.limit || 40, types: opts.types });
      const groups = new Map();
      for (const r of res) {
        const g = groups.get(r.entity.type) || { type: r.entity.type, label: ENTITY_TYPES[r.entity.type], best: r.score, items: [] };
        g.items.push(r); groups.set(r.entity.type, g);
      }
      return [...groups.values()].sort((a, b) => b.best - a.best);
    },
  };
}
