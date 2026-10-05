/* =====================================================================
   KESEHATAN KEUANGAN: Piotroski F-score + Altman Z'' (port dari versi Python)
   Angka laporan keuangan di sini SINTETIS. Rumusnya yang nyata.
   Semua array berurutan: indeks 0 = tahun terbaru.
   ===================================================================== */

function genFund(inst) {
  const r = makeRng(inst.sym + '-fund');
  const q = 0.1 + 0.85 * r();                 // kualitas perusahaan sintetis (0 buruk .. 1 bagus)
  const bank = !!inst.bank;
  const K = ['rev', 'gp', 'ebit', 'ni', 'int', 'ta', 'ca', 'cl', 'tl', 'debt', 'eq', 're', 'sh', 'cfo'];
  const F = Object.fromEntries(K.map(k => [k, []]));
  let rev = (0.5 + r() * 9) * 1e9;
  const shares = (0.2 + r() * 5) * 1e9;
  for (let i = 0; i < 4; i++) {               // dari tahun terlama ke terbaru
    rev *= 1 + 0.04 + 0.12 * (q - 0.5) + r.normal() * 0.04;
    const gm = clamp(0.22 + 0.35 * q + r.normal() * 0.015 + i * (q - 0.5) * 0.015, 0.05, 0.75);
    const nm = clamp(0.01 + 0.22 * q + r.normal() * 0.01 + i * (q - 0.5) * 0.01, -0.05, 0.35);
    const ni = rev * nm;
    const ta = rev * (bank ? 8 + r() * 7 : 0.9 + r() * 0.5);
    const eq = ta * (bank ? 0.12 : 0.20 + 0.45 * q);
    const tl = ta - eq;
    const cr = clamp(0.7 + 1.6 * q + r.normal() * 0.1, 0.4, 3);
    const ca = ta * (0.25 + r() * 0.2);
    const debt = tl * (0.3 + r() * 0.3) * (1.2 - q);
    const sh = shares * (1 + (q > 0.4 ? 0 : 0.03) * i);
    const cfo = ni * (0.9 + r() * 0.5) * (q > 0.3 ? 1 : 0.5);
    const row = { rev, gp: rev * gm, ebit: ni * 1.3, ni, int: rev * 0.01, ta, ca, cl: ca / cr, tl, debt, eq, re: eq * 0.6, sh, cfo };
    for (const k of K) F[k].push(row[k]);
  }
  for (const k of K) F[k].reverse();          // baru -> lama
  if (bank) for (const k of ['gp', 'ca', 'cl', 'debt', 'ebit']) F[k] = F[k].map(() => NaN); // bank tidak punya pos ini
  return F;
}

const fin = Number.isFinite;
const div = (a, b) => (fin(a) && fin(b) && b !== 0) ? a / b : NaN;
const gtN = (a, b) => (fin(a) && fin(b)) ? a > b : null;
const ltN = (a, b) => (fin(a) && fin(b)) ? a < b : null;
const pc = x => fin(x) ? (x * 100).toFixed(1) + '%' : 'n/a';
const nx = x => fin(x) ? x.toFixed(2) : 'n/a';

function piotroski(F) {
  const g = (k, i) => (F[k] ? F[k][i] : NaN);
  const roa0 = div(g('ni', 0), g('ta', 0)), roa1 = div(g('ni', 1), g('ta', 1));
  const cfo0 = g('cfo', 0);
  const roaCfo = div(cfo0, g('ta', 0));
  const gm0 = div(g('gp', 0), g('rev', 0)), gm1 = div(g('gp', 1), g('rev', 1));
  const cr0 = div(g('ca', 0), g('cl', 0)), cr1 = div(g('ca', 1), g('cl', 1));
  const lev0 = div(g('debt', 0), g('ta', 0)), lev1 = div(g('debt', 1), g('ta', 1));
  const sh0 = g('sh', 0), sh1 = g('sh', 1);
  const at0 = div(g('rev', 0), g('ta', 0)), at1 = div(g('rev', 1), g('ta', 1));
  const noDil = (fin(sh0) && fin(sh1)) ? sh0 <= sh1 * 1.005 : null;
  const items = [
    ['Laba: ROA positif', gtN(roa0, 0), 'ROA ' + pc(roa0)],
    ['Laba: arus kas operasi positif', gtN(cfo0, 0), 'CFO per aset ' + pc(roaCfo)],
    ['Laba: ROA naik dari tahun lalu', gtN(roa0, roa1), pc(roa1) + ' ke ' + pc(roa0)],
    ['Kualitas laba: CFO per aset di atas ROA', gtN(roaCfo, roa0), 'CFO ' + pc(roaCfo) + ' vs ROA ' + pc(roa0)],
    ['Utang: rasio utang per aset turun', ltN(lev0, lev1), pc(lev1) + ' ke ' + pc(lev0)],
    ['Likuiditas: current ratio naik', gtN(cr0, cr1), nx(cr1) + ' ke ' + nx(cr0)],
    ['Tidak menerbitkan saham baru', noDil, noDil === null ? 'data tidak ada' : (noDil ? 'jumlah saham stabil' : 'jumlah saham bertambah')],
    ['Efisiensi: margin kotor naik', gtN(gm0, gm1), pc(gm1) + ' ke ' + pc(gm0)],
    ['Efisiensi: perputaran aset naik', gtN(at0, at1), nx(at1) + ' ke ' + nx(at0)],
  ].map(([name, ok, detail]) => ({ name, ok, detail }));
  const score = items.filter(i => i.ok === true).length;
  const avail = items.filter(i => i.ok !== null).length;
  return { score, available: avail, items, normalized: avail ? score / avail : NaN };
}

function altmanZ2(F) {
  const g = k => (F[k] ? F[k][0] : NaN);
  const ta = g('ta');
  const wc = g('ca') - g('cl');
  const tl = fin(g('tl')) ? g('tl') : ta - g('eq');
  const x = [div(wc, ta), div(g('re'), ta), div(g('ebit'), ta), div(g('eq'), tl)];
  if (x.some(v => !fin(v))) return { z: NaN, zone: 'N/A' };
  const z = 6.56 * x[0] + 3.26 * x[1] + 6.72 * x[2] + 1.05 * x[3];
  return { z, zone: z > 2.6 ? 'Aman' : z >= 1.1 ? 'Abu-abu' : 'Distress' };
}

function ratiosOf(F, bank) {
  const g = (k, i = 0) => (F[k] ? F[k][i] : NaN);
  return [
    ['ROE', div(g('ni'), g('eq')), 'pct', [0.15, 0.08, true]],
    ['Margin bersih', div(g('ni'), g('rev')), 'pct', [0.10, 0.05, true]],
    ['Utang per ekuitas', bank ? NaN : div(g('debt'), g('eq')), 'x', [1.0, 2.0, false]],
    ['Current ratio', bank ? NaN : div(g('ca'), g('cl')), 'x', [1.5, 1.0, true]],
    ['Pendapatan YoY', div(g('rev') - g('rev', 1), Math.abs(g('rev', 1))), 'pct', [0.08, 0, true]],
    ['Laba YoY', div(g('ni') - g('ni', 1), Math.abs(g('ni', 1))), 'pct', [0.10, 0, true]],
  ].map(([name, v, kind, [gr, ye, hi]]) => {
    let tone = '';
    if (fin(v)) tone = hi ? (v >= gr ? 'up' : v >= ye ? '' : 'down') : (v <= gr ? 'up' : v <= ye ? '' : 'down');
    return { name, v, kind, tone };
  });
}

function evaluate(inst) {
  if (inst.health) return inst.health;
  if (inst.type !== 'stock') return (inst.health = { na: true });
  const F = genFund(inst);
  const bank = !!inst.bank;
  const p = piotroski(F);
  const az = bank ? { z: NaN, zone: 'N/A (bank)' } : altmanZ2(F);
  const parts = [];
  if (p.available >= 4) parts.push([p.normalized, 0.6]);
  const zs = { 'Aman': 1, 'Abu-abu': 0.5, 'Distress': 0 }[az.zone];
  if (zs !== undefined) parts.push([zs, 0.4]);
  let score = NaN, label = 'Data kurang';
  if (parts.length) {
    const w = parts.reduce((a, [, wt]) => a + wt, 0);
    score = 100 * parts.reduce((a, [v, wt]) => a + v * wt, 0) / w;
    label = score >= 70 ? 'Sehat' : score >= 45 ? 'Waspada' : 'Buruk';
  }
  const good = p.items.filter(i => i.ok === true).map(i => i.name);
  const bad = p.items.filter(i => i.ok === false).map(i => i.name);
  if (az.zone === 'Aman') good.push('Altman Z\'\': zona aman');
  if (az.zone === 'Abu-abu') bad.push('Altman Z\'\': zona abu-abu');
  if (az.zone === 'Distress') bad.push('Altman Z\'\': zona distress, risiko kebangkrutan tinggi');
  return (inst.health = { na: false, score, label, bank, p, az, good, bad, ratios: ratiosOf(F, bank) });
}
