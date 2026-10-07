/* =====================================================================
   MAKRO, OBLIGASI, KOMODITAS, BANK SENTRAL, KORELASI, REZIM, ANALOG
   Sumber utama: FRED (St. Louis Fed) lewat server lokal (tanpa kunci pun bisa,
   memakai CSV publik). BIS untuk suku bunga kebijakan. Semua kalkulasi berlabel.
   ===================================================================== */
const FRED_SETS = {
  curve: [['DGS3MO', '3 bulan', 0.25], ['DGS6MO', '6 bulan', 0.5], ['DGS1', '1 tahun', 1], ['DGS2', '2 tahun', 2], ['DGS5', '5 tahun', 5], ['DGS10', '10 tahun', 10], ['DGS30', '30 tahun', 30]],
  extra: [['DFII10', 'Imbal hasil riil 10 tahun (TIPS)'], ['T10Y2Y', 'Spread 10Y − 2Y'], ['T10Y3M', 'Spread 10Y − 3M'], ['T5YIE', 'Ekspektasi inflasi 5 tahun (breakeven)']],
  macro: [
    ['CPIAUCSL', 'Inflasi CPI', 'yoy', '%'], ['CPILFESL', 'Inflasi inti (tanpa pangan & energi)', 'yoy', '%'], ['PPIFIS', 'Indeks harga produsen (PPI)', 'yoy', '%'],
    ['A191RL1Q225SBEA', 'Pertumbuhan PDB riil (q/q, disetahunkan)', 'level', '%'], ['UNRATE', 'Pengangguran', 'level', '%'], ['PAYEMS', 'Lapangan kerja non-pertanian (NFP)', 'diff', 'ribu'],
    ['RSAFS', 'Penjualan ritel', 'yoy', '%'], ['INDPRO', 'Produksi industri', 'yoy', '%'], ['UMCSENT', 'Sentimen konsumen (U. Michigan)', 'level', 'indeks'],
    ['DFF', 'Fed funds efektif', 'level', '%'], ['M2SL', 'Uang beredar M2', 'yoy', '%'], ['BAMLH0A0HYM2', 'Spread obligasi high-yield', 'level', '%'], ['BAMLC0A0CM', 'Spread obligasi investment-grade', 'level', '%'],
  ],
  regime: [['VIXCLS', 'VIX'], ['SP500', 'S&P 500'], ['DTWEXBGS', 'Dolar AS (broad)'], ['DCOILWTICO', 'Minyak WTI']],
  cmdty: [
    ['DCOILWTICO', 'Minyak WTI', 'USD/barel', 'd'], ['DCOILBRENTEU', 'Minyak Brent', 'USD/barel', 'd'], ['DHHNGSP', 'Gas alam Henry Hub', 'USD/MMBtu', 'd'],
    ['PNGASJPUSDM', 'LNG Asia (Jepang)', 'USD/MMBtu', 'm'], ['PCOALAUUSDM', 'Batu bara Australia', 'USD/ton', 'm'], ['PCOPPUSDM', 'Tembaga', 'USD/ton', 'm'],
    ['PALUMUSDM', 'Aluminium', 'USD/ton', 'm'], ['PNICKUSDM', 'Nikel', 'USD/ton', 'm'], ['PURANUSDM', 'Uranium', 'USD/lb', 'm'],
    ['PWHEAMTUSDM', 'Gandum', 'USD/ton', 'm'], ['PMAIZMTUSDM', 'Jagung', 'USD/ton', 'm'], ['PCOFFOTMUSDM', 'Kopi arabika', 'sen USD/lb', 'm'],
    ['PCOTTINDUSDM', 'Kapas', 'sen USD/lb', 'm'], ['PSUGAISAUSDM', 'Gula', 'sen USD/lb', 'm'], ['PPOILUSDM', 'Minyak sawit', 'USD/ton', 'm'],
  ],
  corr: [['SP500', 'S&P 500', 'ret'], ['NASDAQCOM', 'Nasdaq', 'ret'], ['DGS10', 'US10Y', 'diff'], ['DCOILWTICO', 'WTI', 'ret'], ['DTWEXBGS', 'USD', 'ret'], ['DEXJPUS', 'USD/JPY', 'ret'], ['DEXUSEU', 'EUR/USD', 'ret'], ['CBBTCUSD', 'Bitcoin', 'ret'], ['VIXCLS', 'VIX', 'diff']],
};
const CB_LIST = [['US', 'Federal Reserve'], ['XM', 'ECB'], ['JP', 'Bank of Japan'], ['GB', 'Bank of England'], ['CN', 'PBOC'], ['CH', 'SNB'], ['AU', 'RBA'], ['NZ', 'RBNZ'], ['ID', 'Bank Indonesia'], ['KR', 'Bank of Korea'], ['SG', 'MAS'], ['PH', 'BSP'], ['IN', 'RBI'], ['CA', 'Bank of Canada'], ['BR', 'Banco Central do Brasil'], ['MX', 'Banxico'], ['TR', 'CBRT'], ['ZA', 'SARB']];

const Fred = (() => {
  const mem = {};
  async function get(ids, start, freq) {
    await Net.ready();
    if (!Net.server) return { ok: false, error: 'FRED tidak mengizinkan akses langsung dari browser (tanpa CORS). Jalankan server lokal: npm start. Kunci FRED opsional.' };
    const need = ids.filter(id => !mem[id + start + (freq || '')]);
    for (let i = 0; i < need.length; i += 12) {
      const part = need.slice(i, i + 12);
      const r = await getData('fred', { server: `/api/fred?series=${part.join(',')}&start=${start}${freq ? '&freq=' + freq : ''}`, ttl: 3 * 3600e3, key: 'fred:' + part.join(',') + start + (freq || '') });
      if (!r.ok) { if (i === 0) return r; continue; }
      for (const id of part) {
        const sd = r.data[id];
        mem[id + start + (freq || '')] = sd ? { ...sd, error: null, stale: !!(r.stale || sd.stale), fetchedAt: sd.fetchedAt || r.fetchedAt } : { data: [], error: (r.extra && r.extra.errors && r.extra.errors[id]) || 'tidak ada data' };
        if (sd) FredMeta[id] = { stale: !!(r.stale || sd.stale), fetchedAt: sd.fetchedAt || r.fetchedAt, freq: freqOf(sd.data) };
      }
    }
    const out = {};
    for (const id of ids) out[id] = mem[id + start + (freq || '')] || { data: [], error: 'gagal' };
    /* waktu ambil = yang paling lama di antara seri (jujur soal umur data), basi bila salah satu basi */
    const times = Object.values(out).map(x => x.fetchedAt).filter(Boolean).sort();
    return { ok: true, series: out, source: 'FRED', fetchedAt: times[0] || null, stale: Object.values(out).some(x => x.stale) };
  }
  return { get };
})();
const daysAgo = n => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
function lastVal(s) { return s && s.data && s.data.length ? s.data[s.data.length - 1] : null; }
function valAgo(s, nObs) { return s && s.data && s.data.length > nObs ? s.data[s.data.length - 1 - nObs] : null; }
function yoy(s) {
  if (!s || !s.data || s.data.length < 13) return null;
  const L = s.data[s.data.length - 1], target = new Date(L.date); target.setUTCFullYear(target.getUTCFullYear() - 1);
  const prev = [...s.data].reverse().find(p => new Date(p.date) <= target);
  return prev ? { value: (L.value / prev.value - 1) * 100, date: L.date, prevDate: prev.date } : null;
}
/* metadata per seri FRED dari respons terakhir: basi?, kapan diambil, frekuensi (diukur dari jarak tanggal) */
const FredMeta = {};
function freqOf(pts) {
  if (!pts || pts.length < 3) return null;
  const a = pts.slice(-6), gaps = [];
  for (let i = 1; i < a.length; i++) gaps.push((Date.parse(a[i].date) - Date.parse(a[i - 1].date)) / 86400e3);
  gaps.sort((x, y) => x - y);
  const g = gaps[Math.floor(gaps.length / 2)];
  return g <= 4 ? 'd' : g <= 10 ? 'w' : g <= 35 ? 'm' : g <= 100 ? 'q' : 'a';
}
/* kualitas FRED: harian = "Harian" (akhir hari), bulanan/kuartalan = "Historis" (statistik periodik), basi bila server memakai salinan lama */
function fredQuality(id) { const m = FredMeta[id] || {}; return m.stale ? 'stale' : m.freq === 'd' || m.freq === 'w' ? 'eod' : 'historical'; }
function fredLin(id, label, value, unit, date, formula) {
  const m = FredMeta[id] || {};
  return Lineage.wrap({ label, value, unit, quality: fredQuality(id), source: 'FRED · ' + id, home: 'https://fred.stlouisfed.org/series/' + id, asOf: date, formula, fetchedAt: m.fetchedAt || null, via: 'server', period: { d: 'harian', w: 'mingguan', m: 'bulanan', q: 'kuartalan', a: 'tahunan' }[m.freq] || undefined }, esc(value));
}

const MacroPage = (() => {
  let built = false, loaded = false;
  const S = { corrN: 126, corrData: null, regime: null };

  async function curve() {
    const ids = [...FRED_SETS.curve.map(x => x[0]), ...FRED_SETS.extra.map(x => x[0])];
    const r = await Fred.get(ids, daysAgo(400));
    const el = $('#curveBody');
    if (!r.ok) { el.innerHTML = unavailableBox('Kurva imbal hasil AS (FRED)', r); return; }
    const pts = FRED_SETS.curve.map(([id, label, yrs]) => ({ id, label, yrs, now: lastVal(r.series[id]), m1: valAgo(r.series[id], 21), y1: valAgo(r.series[id], 250), d1: valAgo(r.series[id], 1) }));
    const ok = pts.filter(p => p.now);
    if (!ok.length) { el.innerHTML = unavailableBox('Kurva imbal hasil AS', { error: Object.values(r.series)[0].error }); return; }
    const Wd = 560, Ht = 190, L = 40, R = 12, T = 12, B = 26;
    const all = ok.flatMap(p => [p.now.value, p.y1 && p.y1.value, p.m1 && p.m1.value]).filter(Number.isFinite);
    const lo = Math.floor(Math.min(...all) - 0.2), hi = Math.ceil(Math.max(...all) + 0.2);
    const X = y => L + (Wd - L - R) * Math.log(y / 0.25) / Math.log(30 / 0.25), Y = v => T + (Ht - T - B) * (1 - (v - lo) / (hi - lo));
    const line = (key, color, dash) => { const q = ok.filter(p => p[key]); return q.length > 1 ? `<path d="${q.map((p, i) => (i ? 'L' : 'M') + X(p.yrs).toFixed(1) + ' ' + Y(p[key].value).toFixed(1)).join(' ')}" fill="none" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="4 3"' : ''}/>` + q.map(p => `<circle cx="${X(p.yrs)}" cy="${Y(p[key].value)}" r="2.6" fill="${color}"/>`).join('') : ''; };
    let g = '';
    for (let v = lo; v <= hi; v += Math.max(0.5, Math.round((hi - lo) / 5 * 2) / 2)) g += `<line x1="${L}" x2="${Wd - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#17314a"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${fmt(v, 1)}</text>`;
    g += ok.map(p => `<text x="${X(p.yrs)}" y="${Ht - 8}" text-anchor="middle">${p.label.replace(' tahun', 'Y').replace(' bulan', 'M')}</text>`).join('');
    const spread = (a, b) => { const A = lastVal(r.series[a]), Bv = lastVal(r.series[b]); return A && Bv ? A.value - Bv.value : null; };
    const s2s10 = lastVal(r.series.T10Y2Y), s3m10 = lastVal(r.series.T10Y3M), s10s30 = spread('DGS30', 'DGS10'), real = lastVal(r.series.DFII10), be = lastVal(r.series.T5YIE);
    /* durasi & konveksi obligasi par berkupon tahunan (kalkulasi) */
    const durConv = (y, n) => {
      const c = y / 100, yy = y / 100; let pv = 0, d = 0, cv = 0;
      for (let t = 1; t <= n; t++) { const cf = t === n ? 1 + c : c, df = Math.pow(1 + yy, -t); pv += cf * df; d += t * cf * df; cv += t * (t + 1) * cf * df; }
      return { mod: d / pv / (1 + yy), conv: cv / pv / Math.pow(1 + yy, 2) };
    };
    $('#curveMeta').textContent = 'data s.d. ' + (ok[ok.length - 1].now.date);
    el.innerHTML = `<div class="svgchart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Kurva imbal hasil obligasi AS">${g}${line('y1', '#7188a3', true)}${line('m1', '#6fb1ff', true)}${line('now', '#e0b15a')}</svg>
      <div class="lg"><span><i style="background:#e0b15a"></i>Sekarang</span><span><i style="background:#6fb1ff"></i>±1 bulan lalu</span><span><i style="background:#7188a3"></i>±1 tahun lalu</span>${qBadge(r.stale ? 'stale' : 'eod')}</div></div>
      <table class="dense static"><thead><tr><th>Tenor</th><th class="num">Imbal hasil</th><th class="num">Perubahan 1 hari</th><th class="num">1 bulan</th><th class="num">Durasi mod.</th><th class="num">Konveksitas</th></tr></thead><tbody>
      ${ok.map(p => { const dc = p.yrs >= 1 ? durConv(p.now.value, Math.round(p.yrs)) : { mod: p.yrs / (1 + p.now.value / 100), conv: NaN }; const ch = p.d1 ? Math.round((p.now.value - p.d1.value) * 100) : null, cm = p.m1 ? Math.round((p.now.value - p.m1.value) * 100) : null;   // dalam basis poin, dibulatkan (hindari "-0")
        return `<tr><td>${p.label}</td><td class="num">${fredLin(p.id, 'Imbal hasil ' + p.label, fmt(p.now.value, 2), '%', p.now.date)}</td><td class="num ${sign(ch)}">${ch === null ? '–' : (ch > 0 ? '+' : '') + fmt(ch, 0) + ' bp'}</td><td class="num ${sign(cm)}">${cm === null ? '–' : (cm > 0 ? '+' : '') + fmt(cm, 0) + ' bp'}</td><td class="num">${fmt(dc.mod, 2)}</td><td class="num">${fmt(dc.conv, 1)}</td></tr>`; }).join('')}
      </tbody></table>
      <dl class="kv three">
        <div><dt>10Y − 2Y</dt><dd class="${sign(s2s10 && s2s10.value)}">${s2s10 ? fredLin('T10Y2Y', 'Spread 10Y-2Y', fmt(s2s10.value, 2), '%', s2s10.date) : '–'}</dd><small>${s2s10 && s2s10.value < 0 ? 'terbalik (sering mendahului resesi)' : 'positif'}</small></div>
        <div><dt>10Y − 3M</dt><dd>${s3m10 ? fredLin('T10Y3M', 'Spread 10Y-3M', fmt(s3m10.value, 2), '%', s3m10.date) : '–'}</dd></div>
        <div><dt>30Y − 10Y</dt><dd>${s10s30 === null ? '–' : fmt(s10s30, 2)}</dd><small>kalkulasi</small></div>
        <div><dt>Riil 10Y (TIPS)</dt><dd>${real ? fredLin('DFII10', 'Imbal hasil riil 10Y', fmt(real.value, 2), '%', real.date) : '–'}</dd></div>
        <div><dt>Breakeven 5Y</dt><dd>${be ? fredLin('T5YIE', 'Ekspektasi inflasi 5Y', fmt(be.value, 2), '%', be.date) : '–'}</dd></div>
      </dl>
      <p class="hint">Durasi termodifikasi dan konveksitas dihitung (${qBadge('calculated')}) untuk obligasi par berkupon tahunan dengan kupon = imbal hasil; perkiraan sensitivitas harga, bukan data pasar.</p>`;
  }

  async function macro() {
    const ids = FRED_SETS.macro.map(x => x[0]);
    const r = await Fred.get(ids, daysAgo(5 * 365));
    const el = $('#macroBody');
    if (!r.ok) { el.innerHTML = unavailableBox('Dasbor makro AS (FRED)', r); return; }
    const rows = FRED_SETS.macro.map(([id, label, mode, unit]) => {
      const s = r.series[id];
      if (!s || !s.data.length) return { id, label, unit, na: s && s.error };
      const L = lastVal(s), P = valAgo(s, 1);
      let now, prev, formula = '';
      if (mode === 'yoy') {
        now = yoy(s);
        const sp = { data: s.data.slice(0, -1) }; prev = yoy(sp);
        formula = 'nilai ÷ nilai 12 bulan sebelumnya − 1';
        return { id, label, unit, now: now && now.value, prev: prev && prev.value, date: L.date, formula, mode };
      }
      if (mode === 'diff') { formula = 'perubahan dari periode sebelumnya'; return { id, label, unit, now: P ? L.value - P.value : null, prev: valAgo(s, 2) && P ? P.value - valAgo(s, 2).value : null, date: L.date, formula, mode }; }
      return { id, label, unit, now: L.value, prev: P ? P.value : null, date: L.date, formula: 'nilai terakhir', mode };
    });
    S.macroRows = rows;
    el.innerHTML = `<table class="dense static"><thead><tr><th>Indikator</th><th class="num">Terbaru</th><th class="num">Sebelumnya</th><th class="num">Perubahan</th><th>Periode</th><th class="num">Konsensus</th></tr></thead><tbody>` +
      rows.map(x => x.na !== undefined || x.now === undefined ? `<tr><td>${esc(x.label)}</td><td class="num c-na" colspan="5">tidak tersedia ${x.na ? '(' + esc(x.na) + ')' : ''}</td></tr>` :
        `<tr><td>${esc(x.label)} <span class="sub">${esc(x.id)}${x.mode === 'yoy' ? ' · YoY dihitung' : ''}</span></td><td class="num">${x.now === null ? '–' : fredLin(x.id, x.label, fmt(x.now, x.unit === 'ribu' ? 0 : 2), x.unit, x.date, x.formula)}</td>
         <td class="num">${x.prev === null ? '–' : fmt(x.prev, x.unit === 'ribu' ? 0 : 2)}</td><td class="num ${sign(x.now - x.prev)}">${x.now === null || x.prev === null ? '–' : (x.now - x.prev > 0 ? '+' : '') + fmt(x.now - x.prev, 2)}</td><td>${esc(x.date)}</td>
         <td class="num c-na" title="Data konsensus/perkiraan ekonom berlisensi; tidak ada sumber gratis resmi">n/a</td></tr>`).join('') +
      `</tbody></table><div class="src-foot">${qBadge(r.stale ? 'stale' : 'historical', 'Seri bulanan/kuartalan statistik resmi')} FRED · ${r.fetchedAt ? 'diambil ' + esc(fmtAge(r.fetchedAt)) + ' · ' : ''}YoY dan perubahan = ${qBadge('calculated')} · "Kejutan makro" (aktual vs konsensus) tidak dihitung karena data konsensus tidak tersedia gratis.</div>`;
  }

  async function commodities() {
    const ids = FRED_SETS.cmdty.map(x => x[0]);
    const r = await Fred.get(ids, daysAgo(3 * 365));
    const el = $('#cmdtyBody');
    if (!r.ok) { el.innerHTML = unavailableBox('Komoditas (FRED)', r); return; }
    const rows = FRED_SETS.cmdty.map(([id, label, unit, f]) => {
      const s = r.series[id], L = lastVal(s);
      if (!L) return `<tr><td>${esc(label)}</td><td colspan="5" class="c-na">tidak tersedia</td></tr>`;
      const n1 = f === 'd' ? 21 : 1, n12 = f === 'd' ? 250 : 12;
      const a = valAgo(s, n1), b = valAgo(s, n12);
      const rets = Analytics.returns(s.data.slice(f === 'd' ? -64 : -13).map(p => p.value));
      const vol = Analytics.stdev(rets) * Math.sqrt(f === 'd' ? 252 : 12) * 100;
      const c1 = a ? L.value / a.value - 1 : null, c12 = b ? L.value / b.value - 1 : null;
      return `<tr><td>${esc(label)} <span class="sub">${esc(unit)} · ${f === 'd' ? 'harian' : 'bulanan (IMF)'}</span></td><td class="num">${fredLin(id, label, fmt(L.value, L.value < 20 ? 2 : 0), unit, L.date)}</td>
        <td class="num ${sign(c1)}">${c1 === null ? '–' : fmtPct(c1, 1)}</td><td class="num ${sign(c12)}">${c12 === null ? '–' : fmtPct(c12, 1)}</td><td class="num">${Number.isFinite(vol) ? fmt(vol, 0) + '%' : '–'}</td><td>${esc(L.date)}</td></tr>`;
    }).join('');
    el.innerHTML = `<table class="dense static"><thead><tr><th>Komoditas</th><th class="num">Harga</th><th class="num">1 bln</th><th class="num">1 thn</th><th class="num">Vol. thn</th><th>Data s.d.</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="src-foot">${qBadge(r.stale ? 'stale' : 'eod', 'Harian untuk minyak/gas; bulanan (rata-rata) untuk logam & pertanian')} FRED (EIA, IMF Primary Commodity Prices). Volatilitas = ${qBadge('calculated')} dari 3 bulan terakhir. Emas, perak, litium: tidak tersedia di FRED gratis. Persediaan, produksi, ekspor/impor energi: butuh kunci EIA (belum dipasang).</div>`;
  }

  async function centralBanks() {
    const el = $('#cbBody');
    const r = await CountryData.policyRates();
    if (!r.ok) { el.innerHTML = unavailableBox('Suku bunga bank sentral (BIS)', r, Net.server ? '' : 'BIS diakses lewat server lokal (npm start).'); return; }
    el.innerHTML = `<table class="dense static"><thead><tr><th>Bank sentral</th><th class="num">Suku bunga</th><th class="num">Sebelumnya</th><th>Perubahan terakhir</th><th>Arah</th><th>Rapat berikut</th></tr></thead><tbody>` +
      CB_LIST.map(([k, name]) => {
        const s = r.data[k];
        if (!s || !s.length) return `<tr><td>${esc(name)}</td><td colspan="5" class="c-na">tidak ada di data BIS${k === 'SG' ? ' (MAS memakai kebijakan nilai tukar, bukan suku bunga)' : ''}</td></tr>`;
        const last = s[s.length - 1];
        let i = s.length - 1; while (i > 0 && s[i - 1].value === last.value) i--;
        const prev = i > 0 ? s[i - 1] : null, changedAt = s[i].period;
        const dir = !prev ? 'stabil' : last.value > prev.value ? 'naik' : 'turun';
        return `<tr><td>${esc(name)} <span class="sub">${esc(k)}</span></td><td class="num">${Lineage.wrap({ label: 'Suku bunga ' + name, value: fmt(last.value, 2), unit: '%', quality: r.stale ? 'stale' : 'historical', source: 'BIS WS_CBPOL', home: SOURCE_DEFS.bis.home, asOf: last.period, fetchedAt: r.fetchedAt, via: r.via }, fmt(last.value, 2) + '%')}</td>
          <td class="num">${prev ? fmt(prev.value, 2) + '%' : '–'}</td><td>${esc(changedAt)}</td><td class="${dir === 'naik' ? 'down' : dir === 'turun' ? 'up' : ''}">${dir}</td><td class="c-na" title="Jadwal rapat tidak tersedia dari API gratis">–</td></tr>`;
      }).join('') + `</tbody></table><div class="src-foot">${srcLine(r, 'data bulanan; pernyataan dan kutipan bank sentral tidak tersedia dari API gratis')}</div>`;
  }

  async function regimeAndCorr() {
    const ids = [...new Set([...FRED_SETS.regime.map(x => x[0]), ...FRED_SETS.corr.map(x => x[0]), 'BAMLH0A0HYM2', 'T10Y2Y'])];
    const r = await Fred.get(ids, daysAgo(6 * 365));
    if (!r.ok) { $('#regimeBody').innerHTML = unavailableBox('Mesin rezim pasar', r); $('#corrBody').innerHTML = unavailableBox('Korelasi', r); $('#analogBody').innerHTML = unavailableBox('Analog historis', r); $('#regimeBadge').innerHTML = qBadge('unavailable'); return; }
    const s = r.series;
    const sp = s.SP500 && s.SP500.data;
    let ma = null;
    if (sp && sp.length > 200) ma = sp.slice(-200).reduce((a, p) => a + p.value, 0) / 200;
    const chg = (id, n) => { const L = lastVal(s[id]), A = valAgo(s[id], n); return L && A ? L.value / A.value - 1 : null; };
    const inp = {
      vix: lastVal(s.VIXCLS)?.value ?? null, hyOas: lastVal(s.BAMLH0A0HYM2)?.value ?? null, curve2s10s: lastVal(s.T10Y2Y)?.value ?? null,
      sp500VsMa200: ma && sp ? sp[sp.length - 1].value / ma - 1 : null, dxyChg1m: chg('DTWEXBGS', 21), oilChg1m: chg('DCOILWTICO', 21),
    };
    const g = Analytics.marketRegime(inp);
    S.regime = g;
    const col = g.regime === 'Risk on' ? 'var(--up)' : g.regime === 'Risk off' ? 'var(--down)' : 'var(--brass)';
    $('#regimeBadge').innerHTML = qBadge('calculated');
    $('#regimeBody').innerHTML = `<div class="bigscore"><strong style="color:${col};font-family:var(--font-ui);font-size:26px">${esc(g.regime)}</strong><span class="meta">skor ${g.score === null ? '–' : fmt(g.score, 2)} (−1…+1) · keyakinan ${g.confidence}%</span></div>
      <table class="dense static"><thead><tr><th>Bukti</th><th class="num">Nilai</th><th>Suara</th><th>Arti</th></tr></thead><tbody>
      ${g.evidence.map(e => `<tr><td>${esc(e.label)}</td><td class="num">${e.key === 'trend' || e.key === 'usd' || e.key === 'oil' ? fmtPct(e.val, 1) : fmt(e.val, 2)}</td><td class="${e.vote > 0 ? 'up' : e.vote < 0 ? 'down' : ''}">${e.vote > 0 ? 'risk on' : e.vote < 0 ? 'risk off' : 'netral'}</td><td style="white-space:normal">${esc(e.why)}</td></tr>`).join('')}
      </tbody></table>
      <p class="hint">Aturan: tiap bukti memberi suara +1/0/−1 dengan ambang tetap (lihat Metodologi). Skor = rata-rata suara. Keyakinan = porsi bukti yang searah × kelengkapan data. Lebar pasar (breadth) dan likuiditas tidak dihitung karena datanya tidak tersedia gratis.</p>`;
    S.corrData = s;
    corr();
    analogs();
  }
  function corr() {
    const s = S.corrData; if (!s) return;
    const series = {};
    for (const [id, label, mode] of FRED_SETS.corr) if (s[id] && s[id].data.length > 30) series[label] = { pts: s[id].data, mode };
    const aligned = Analytics.alignSeries(Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.pts])));
    const n = Math.min(S.corrN + 1, aligned.dates.length);
    if (n < 15) { $('#corrBody').innerHTML = '<p class="hint">Data yang tanggalnya sama terlalu sedikit untuk menghitung korelasi.</p>'; return; }
    const keys = Object.keys(aligned.cols);
    const rets = {};
    for (const k of keys) {
      const v = aligned.cols[k].slice(-n);
      rets[k] = series[k].mode === 'diff' ? v.slice(1).map((x, i) => x - v[i]) : Analytics.returns(v);
    }
    const cell = v => `<td class="num"><span class="heat" style="background:${Number.isFinite(v) ? (v >= 0 ? `rgb(52 209 164 / ${Math.abs(v) * 0.6})` : `rgb(255 111 97 / ${Math.abs(v) * 0.6})`) : 'transparent'}">${Number.isFinite(v) ? fmt(v, 2) : '–'}</span></td>`;
    $('#corrBody').innerHTML = `<div class="table-wrap"><table class="dense static"><thead><tr><th></th>${keys.map(k => `<th class="num">${esc(k)}</th>`).join('')}</tr></thead><tbody>
      ${keys.map(a => `<tr><td>${esc(a)}</td>${keys.map(b => cell(a === b ? 1 : Analytics.correlation(rets[a], rets[b]))).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="hint">${qBadge('calculated')} Korelasi Pearson dari ${n - 1} pengamatan harian yang tanggalnya sama (s.d. ${esc(aligned.dates[aligned.dates.length - 1])}). Harga memakai return harian; US10Y dan VIX memakai perubahan harian. Korelasi berubah-ubah dan bukan sebab-akibat.</p>`;
  }

  /* analog historis: bulan-bulan sejak 1971 dengan kondisi makro paling mirip */
  async function analogs() {
    const box = $('#analogBody'); if (!box) return;
    const r = await Fred.get(['CPIAUCSL', 'FEDFUNDS', 'UNRATE', 'WTISPLC', 'NASDAQCOM'], '1970-01-01', 'm');
    if (!r.ok) { box.innerHTML = unavailableBox('Analog historis', r); return; }
    const mp = id => new Map((r.series[id].data || []).map(p => [p.date.slice(0, 7), p.value]));
    const cpi = mp('CPIAUCSL'), ff = mp('FEDFUNDS'), un = mp('UNRATE'), oil = mp('WTISPLC'), nq = mp('NASDAQCOM');
    const months = [...cpi.keys()].sort();
    const back = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 - k, 1)); return d.toISOString().slice(0, 7); };
    const feat = m => {
      const c0 = cpi.get(m), c12 = cpi.get(back(m, 12)), o0 = oil.get(m), o6 = oil.get(back(m, 6));
      const f = [c0 && c12 ? (c0 / c12 - 1) * 100 : null, ff.get(m) ?? null, un.get(m) ?? null, o0 && o6 ? (o0 / o6 - 1) * 100 : null];
      return f.every(x => x !== null && Number.isFinite(x)) ? f : null;
    };
    const rows = months.map(m => ({ m, f: feat(m) })).filter(x => x.f);
    if (rows.length < 60) { box.innerHTML = '<p class="hint">Riwayat FRED tidak cukup untuk mencari analog.</p>'; return; }
    const cur = rows[rows.length - 1];
    const sd = [0, 1, 2, 3].map(i => Analytics.stdev(rows.map(x => x.f[i])));
    const cand = rows.slice(0, -24).map(x => ({ ...x, d: Math.sqrt(x.f.reduce((a, v, i) => a + ((v - cur.f[i]) / sd[i]) ** 2, 0)) })).sort((a, b) => a.d - b.d);
    const picked = [];
    for (const c of cand) { if (picked.every(p => Math.abs(Date.parse(p.m + '-01') - Date.parse(c.m + '-01')) > 3 * 365 * 86400e3)) picked.push(c); if (picked.length >= 5) break; }
    const fwd = (map, m, k, rel) => { const a = map.get(m), b = map.get(back(m, -k)); return a !== undefined && b !== undefined ? (rel ? b / a - 1 : b - a) : null; };
    box.innerHTML = `<p class="lead">Kondisi terkini (${esc(cur.m)}): inflasi ${fmt(cur.f[0], 1)}%, Fed funds ${fmt(cur.f[1], 2)}%, pengangguran ${fmt(cur.f[2], 1)}%, minyak 6 bulan ${fmtPct(cur.f[3] / 100, 0)}.</p>
      <table class="dense static"><thead><tr><th>Periode mirip</th><th class="num">Jarak</th><th class="num">Inflasi</th><th class="num">Fed funds</th><th class="num">Nasdaq +12 bln</th><th class="num">Pengangguran +12 bln</th><th class="num">Fed funds +12 bln</th></tr></thead><tbody>
      ${picked.map(p => { const nqr = fwd(nq, p.m, 12, true), u = fwd(un, p.m, 12), f = fwd(ff, p.m, 12); return `<tr><td>${esc(p.m)}</td><td class="num">${fmt(p.d, 2)}</td><td class="num">${fmt(p.f[0], 1)}%</td><td class="num">${fmt(p.f[1], 2)}%</td><td class="num ${sign(nqr)}">${nqr === null ? '–' : fmtPct(nqr, 0)}</td><td class="num">${u === null ? '–' : (u > 0 ? '+' : '') + fmt(u, 1)}</td><td class="num">${f === null ? '–' : (f > 0 ? '+' : '') + fmt(f, 2)}</td></tr>`; }).join('')}
      </tbody></table>
      <p class="hint">${qBadge('calculated')} Jarak Euclid dari 4 variabel yang distandardisasi (inflasi YoY, Fed funds, pengangguran, perubahan minyak 6 bulan), data bulanan FRED sejak 1971, minimal 3 tahun antar analog. Keterbatasan: hanya 4 variabel AS; struktur ekonomi berubah; hasil masa lalu tidak menjamin masa depan; Nasdaq dipakai sebagai proksi saham.</p>`;
  }

  /* uji tekanan portofolio simulasi */
  const CLS = [['equity', 'Saham'], ['em', 'Saham negara berkembang'], ['bond', 'Obligasi'], ['gold', 'Emas'], ['energy', 'Energi/komoditas'], ['crypto', 'Kripto'], ['cash', 'Kas/deposito']];
  const pf = Store.get('stressPf', { capital: 100000000, w: { equity: 30, em: 20, bond: 25, gold: 5, energy: 5, crypto: 5, cash: 10 } });
  function stress() {
    const el = $('#stressBody');
    const pos = CLS.map(([k]) => ({ cls: k, value: pf.capital * (pf.w[k] || 0) / 100 }));
    const totW = Object.values(pf.w).reduce((a, b) => a + (+b || 0), 0);
    const res = Object.keys(Analytics.SHOCKS).map(id => Analytics.stressTest(pos, id));
    const rp = n => (n < 0 ? '−' : '') + 'Rp ' + Math.round(Math.abs(n)).toLocaleString('id-ID');
    el.innerHTML = `<div class="c-cols"><div class="c-sec"><h3>Portofolio simulasi (ubah bobot %)</h3>
      <div class="field"><label for="stCap">Modal simulasi (Rp)</label><input id="stCap" inputmode="numeric" value="${Math.round(pf.capital).toLocaleString('id-ID')}" class="mini-input" style="inline-size:200px"></div>
      <table class="dense static"><tbody>${CLS.map(([k, l]) => `<tr><td>${esc(l)}</td><td class="num"><input class="mini-input" style="inline-size:70px;text-align:end" type="number" min="0" max="100" step="5" data-w="${k}" value="${pf.w[k] || 0}" aria-label="Bobot ${esc(l)}"> %</td></tr>`).join('')}
      <tr><td>Total</td><td class="num ${totW === 100 ? '' : 'down'}">${totW}%${totW === 100 ? '' : ' (harus 100%)'}</td></tr></tbody></table></div>
      <div class="c-sec"><h3>Perkiraan dampak skenario ${qBadge('calculated')}</h3>
      <table class="dense static"><thead><tr><th>Skenario</th><th class="num">Dampak</th><th class="num">%</th></tr></thead><tbody>
      ${res.map(x => `<tr><td>${esc(x.label)}</td><td class="num ${sign(x.total)}">${rp(x.total)}</td><td class="num ${sign(x.pct)}">${fmtPct(x.pct, 1)}</td></tr>`).join('')}</tbody></table></div></div>
      <details class="explain"><summary>Asumsi sensitivitas per kelas aset (dari mana angka ini?)</summary>
      <table class="dense static"><thead><tr><th>Skenario</th>${CLS.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>
      ${Object.values(Analytics.SHOCKS).map(s => `<tr><td>${esc(s.label)}</td>${CLS.map(([k]) => `<td class="num">${fmtPct(s.f[k] || 0, 1)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <p class="hint">Angka sensitivitas adalah asumsi kasar pembuat aplikasi berdasarkan pola umum (bukan hasil regresi data nyata). Dampak sebenarnya bergantung aset spesifik, waktu, dan reaksi kebijakan. Ini alat latihan berpikir, bukan model risiko dan bukan nasihat investasi.</p></details>`;
  }

  function build() {
    if (built) return;
    built = true;
    const g = document.createElement('section');
    g.className = 'card analog-card'; g.setAttribute('aria-label', 'Analog historis');
    g.innerHTML = '<div class="card-head"><h2>Analog historis</h2><span class="meta">periode dengan kondisi makro AS paling mirip</span></div><div class="side-body" id="analogBody"><p class="loading">Menunggu data FRED</p></div>';
    $('#page-macro').insertBefore(g, $('.stress-card'));
    $('#corrSeg').addEventListener('click', e => { const b = e.target.closest('[data-tf]'); if (!b) return; S.corrN = +b.dataset.tf; $$('#corrSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); corr(); });
    $('#macroExport').addEventListener('click', () => { if (!S.macroRows) return; download('makro-as.csv', toCsv([['seri', 'indikator', 'terbaru', 'sebelumnya', 'periode', 'satuan'], ...S.macroRows.map(x => [x.id, x.label, x.now ?? '', x.prev ?? '', x.date ?? '', x.unit])]), 'text/csv'); });
    $('#stressBody').addEventListener('change', e => {
      if (e.target.id === 'stCap') { pf.capital = +String(e.target.value).replace(/[^\d]/g, '') || 0; }
      const k = e.target.dataset.w; if (k) pf.w[k] = clamp(+e.target.value || 0, 0, 100);
      Store.set('stressPf', pf); stress();
    });
  }
  return {
    show() {
      build();
      stress();
      if (loaded) return;
      loaded = true;
      ['#curveBody', '#macroBody', '#cmdtyBody', '#cbBody', '#regimeBody', '#corrBody'].forEach(s => { $(s).innerHTML = '<p class="loading">Memuat</p>'; });
      const safe = (fn, sel, what) => fn().catch(e => { console.warn(what, e); $(sel).innerHTML = unavailableBox(what, { error: 'Kesalahan aplikasi: ' + e.message }); });
      safe(regimeAndCorr, '#regimeBody', 'Rezim pasar');
      safe(curve, '#curveBody', 'Kurva imbal hasil');
      safe(macro, '#macroBody', 'Dasbor makro');
      safe(commodities, '#cmdtyBody', 'Komoditas');
      safe(centralBanks, '#cbBody', 'Bank sentral');
    },
    reload() { loaded = false; },
    get regime() { return S.regime; },
  };
})();
