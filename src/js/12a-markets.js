/* =====================================================================
   HALAMAN PASAR: SUKU BUNGA (RATES), VALAS (FX), KOMODITAS (CMDTY)
   - Satu pola untuk ketiganya: tabel semua entitas registri jenis itu (Quotes.get, Datum dengan
     sumber/waktu/kualitas) + grafik ProChart untuk baris terpilih. Klik kode = detail aset.
   - Tidak ada angka karangan: aset tanpa sumber tampil "–" dengan alasannya (mis. emas/perak
     tanpa Yahoo tidak resmi). Kurs referensi harian tidak pernah ditampilkan sebagai "Live";
     kualitas mengikuti sumbernya.
   - RATES menambah: kurva Treasury AS (dari baris tabel yang sama) dan suku bunga kebijakan
     bank sentral (BIS, bulanan).
   ===================================================================== */
const MarketList = (() => {
  const POOL = 4;
  function make(cfg) {
    const S = { built: false, seq: 0, rows: new Map(), sel: null, chart: null, at: null };
    const P = cfg.prefix, $p = s => $('#' + P + s), page = () => $('#page-' + cfg.id);
    const ents = () => REG.all().filter(e => e.type === cfg.type && (!cfg.filter || cfg.filter(e))).sort((a, b) => (b.weight || 0) - (a.weight || 0) || a.symbol.localeCompare(b.symbol));
    const fmtV = (e, d) => (d && d.value !== null ? cfg.dp ? fmt(d.value, cfg.dp(e, d.value)) : fmt(d.value, 2) : null);
    function rowHtml(e) {
      const q = S.rows.get(e.id);
      const sel = S.sel && S.sel.id === e.id;
      if (!q) return `<tr data-id="${esc(e.id)}" aria-selected="${sel}"><th scope="row"><button type="button" class="link-btn" data-mk-pick>${esc(e.symbol)}</button><span class="sub">${esc(e.name)}</span></th><td class="num" colspan="5"><span class="loading sm">memuat</span></td></tr>`;
      const p = q.price || datum(null, { reason: q.reason || 'tidak tersedia' });
      const chg = cfg.bp ? (q.change && q.change.value !== null ? { ...q.change, value: q.change.value * 100 } : null) : q.changePct;
      const chgTxt = chg && chg.value !== null ? (cfg.bp ? (chg.value > 0 ? '+' : '') + fmt(chg.value, 0) + ' bp' : fmtPct(chg.value / 100, 2)) : null;
      const chgCell = chgTxt === null ? '<span class="na" title="Perubahan tidak tersedia">–</span>'
        : Lineage.wrap({ label: (cfg.bp ? 'Perubahan (basis poin) ' : 'Perubahan % ') + e.symbol, value: chgTxt, quality: 'calculated', source: p.source, asOf: p.asOf, fetchedAt: p.fetchedAt, formula: cfg.bp ? '(nilai terakhir − nilai pengamatan sebelumnya) × 100 basis poin' : '(harga terakhir ÷ penutupan/pengamatan sebelumnya − 1) × 100' }, `<span class="${sign(chg.value)}">${esc(chgTxt)}</span>`);
      return `<tr data-id="${esc(e.id)}" aria-selected="${sel}"><th scope="row"><button type="button" class="link-btn" data-mk-pick>${esc(e.symbol)}</button><span class="sub">${esc(e.name)}${e.unit ? ' · ' + esc(e.unit) : ''}</span></th>
        <td class="num">${p.value === null ? `<span class="na" title="${esc('Tidak tersedia: ' + (p.reason || q.reason || 'tanpa sumber'))}">Tidak tersedia</span>` : datumHtml(p, { dp: cfg.dp ? cfg.dp(e, p.value) : 2, label: e.symbol })}</td>
        <td class="num">${chgCell}</td>
        <td>${datumAge(p)}</td>
        <td class="wrap mk-src">${esc(p.value === null ? (p.reason || q.reason || '') : p.source || '')}${q.note ? `<span class="sub">${esc(q.note)}</span>` : ''}${e.note ? `<span class="sub">${esc(e.note)}</span>` : ''}</td>
        <td><button type="button" class="mini-btn" data-mk-open-row aria-label="Buka detail ${esc(e.symbol)}">Detail</button></td></tr>`;
    }
    function draw() {
      const list = ents();
      $p('Body').innerHTML = `<table class="dense mk-tbl"><caption class="sr">${esc(cfg.title)}</caption><thead><tr><th scope="col">Kode</th><th scope="col" class="num">${esc(cfg.valueLabel || 'Harga')}</th><th scope="col" class="num">${cfg.bp ? 'Perubahan' : 'Perubahan %'}</th><th scope="col">Kualitas / umur</th><th scope="col">Sumber</th><th scope="col"><span class="sr">Aksi</span></th></tr></thead><tbody>${list.map(rowHtml).join('')}</tbody></table>`;
      const done = [...S.rows.values()], ok = done.filter(q => q.price && q.price.value !== null).length;
      $p('Meta').textContent = `${ok} dari ${list.length} punya data${S.at ? ' · diperbarui ' + fmtAge(S.at) : ''}`;
      if (cfg.extra) cfg.extra(S, $p('Extra'));
    }
    function setSel(e) {
      if (!e) return;
      S.sel = e;
      $p('ChartTitle').textContent = 'Grafik ' + e.symbol + ' · ' + e.name;
      if (!S.chart) S.chart = ProChart.create($p('Chart'), { tf: cfg.tf || '1Y', type: 'line' });
      S.chart.set(e);
      $$(`#${P}Body tr[data-id]`).forEach(tr => tr.setAttribute('aria-selected', String(tr.dataset.id === e.id)));
    }
    async function load() {
      const my = ++S.seq, alive = () => my === S.seq && !page().hidden;
      const list = ents();
      S.rows.clear(); draw();
      let i = 0;
      const worker = async () => {
        while (i < list.length) {
          const e = list[i++];
          let q;
          try { q = await Quotes.get(e); } catch (err) { ErrorLog.report('data', cfg.title + ' ' + e.symbol + ': ' + err.message); q = { ok: false, price: datum(null, { reason: 'kesalahan aplikasi: ' + err.message }), reason: err.message }; }
          if (!alive()) return;
          S.rows.set(e.id, q);
          const tr = $(`#${P}Body tr[data-id="${CSS.escape(e.id)}"]`);
          if (tr) tr.outerHTML = rowHtml(e);
        }
      };
      await Promise.all(Array.from({ length: POOL }, worker));
      if (!alive()) return;
      S.at = new Date().toISOString();
      draw();
    }
    function build() {
      if (S.built) return;
      S.built = true;
      $p('Note').innerHTML = cfg.note;
      const pg = page();
      pg.querySelector('[data-mk-reload]').addEventListener('click', load);
      pg.querySelector('[data-mk-open]').addEventListener('click', () => { if (S.sel) { SecurityPage.open(S.sel, 'chart'); App.showPage('security'); } });
      pg.querySelector('[data-mk-csv]').addEventListener('click', () => {
        const rows = ents().map(e => { const q = S.rows.get(e.id) || {}, p = q.price || {}; return [e.symbol, e.name, e.unit || e.currency || '', p.value ?? null, cfg.bp ? (q.change && q.change.value !== null ? q.change.value * 100 : null) : (q.changePct ? q.changePct.value : null), p.quality || 'unavailable', p.asOf || '', p.fetchedAt || '', p.source || '', p.value === null || p.value === undefined ? (p.reason || q.reason || '') : '']; });
        download(cfg.id + '.csv', toCsv([['kode', 'nama', 'satuan', 'nilai', cfg.bp ? 'perubahan_bp' : 'perubahan_pct', 'kualitas', 'waktu_data', 'diambil', 'sumber', 'alasan_tidak_tersedia'], ...rows]), 'text/csv');
      });
      $p('Body').addEventListener('click', ev => {
        const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
        const e = REG.get(tr.dataset.id); if (!e) return;
        if (ev.target.closest('[data-mk-open-row]')) { SecurityPage.open(e, 'overview'); App.showPage('security'); return; }
        if (ev.target.closest('.lin')) return;
        setSel(e);
      });
    }
    return {
      show() {
        build();
        if (!S.rows.size) load(); else draw();
        if (!S.sel) setSel(REG.get(cfg.def) || ents()[0]);
        else if (S.chart) S.chart.reload();
      },
      hide() { S.seq++; },
      get state() { return { rows: S.rows.size, total: ents().length, sel: S.sel && S.sel.id, chart: S.chart ? S.chart.state : null }; },
      quotes: () => S.rows,
    };
  }
  return { make };
})();

/* ---------- suku bunga ---------- */
const CURVE_IDS = [['rate:US3M', 0.25, '3B'], ['rate:US2Y', 2, '2T'], ['rate:US5Y', 5, '5T'], ['rate:US10Y', 10, '10T'], ['rate:US30Y', 30, '30T']];
function curveSvg(rows) {
  const pts = CURVE_IDS.map(([id, yrs, lbl]) => { const q = rows.get(id), p = q && q.price; return p && p.value !== null ? { yrs, lbl, v: p.value, asOf: p.asOf } : null; }).filter(Boolean);
  if (pts.length < 3) return `<p class="hint">Kurva Treasury: titik belum cukup (${pts.length} dari ${CURVE_IDS.length}).</p>`;
  const W = 360, H = 130, L = 34, R = 10, T = 10, B = 22;
  const lx = y => Math.log(y + 0.25), x0 = lx(0.25), x1 = lx(30);
  const X = y => L + (lx(y) - x0) / (x1 - x0) * (W - L - R);
  const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v)), pad = Math.max(0.1, (hi - lo) * 0.15);
  const Y = v => T + (hi + pad - v) / (hi - lo + 2 * pad) * (H - T - B);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p.yrs).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
  const inv = pts.find(p => p.yrs === 0.25) && pts.find(p => p.yrs === 10) && pts.find(p => p.yrs === 10).v < pts.find(p => p.yrs === 0.25).v;
  return `<figure class="mk-curve"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kurva imbal hasil Treasury AS: ${esc(pts.map(p => p.lbl + ' ' + fmt(p.v, 2) + '%').join(', '))}">
      ${[lo, hi].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="rgba(42,74,104,0.5)"/><text x="${L - 4}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#93a8bf">${fmt(v, 2)}</text>`).join('')}
      <path d="${path}" fill="none" stroke="#e0b15a" stroke-width="2"/>
      ${pts.map(p => `<circle cx="${X(p.yrs).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.8" fill="#e0b15a"/><text x="${X(p.yrs).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#93a8bf">${p.lbl}</text>`).join('')}
    </svg><figcaption class="meta">Kurva Treasury AS (FRED, harian) per ${esc(pts.map(p => p.asOf).filter(Boolean).sort().pop() || '–')}${inv ? ' · <b>terbalik</b>: 10 tahun di bawah 3 bulan' : ''}</figcaption></figure>`;
}
let _cbHtml = null, _cbSeq = 0;
async function cbTable(el) {
  if (_cbHtml) { el.querySelector('.mk-cb').innerHTML = _cbHtml; return; }
  const my = ++_cbSeq;
  const box = el.querySelector('.mk-cb');
  box.innerHTML = '<p class="loading">Mengambil suku bunga kebijakan (BIS)</p>';
  const r = await CountryData.policyRates();
  if (my !== _cbSeq || !box.isConnected) return;
  if (!r.ok) { box.innerHTML = unavailableBox('Suku bunga kebijakan bank sentral (BIS)', r, Net.server ? '' : 'BIS diakses lewat server lokal (npm start).'); return; }
  const rows = CB_LIST.map(([k, name]) => {
    const s = r.data[k];
    if (!s || !s.length) return `<tr><th scope="row">${esc(name)}</th><td class="num" colspan="3"><span class="na">tidak ada di data BIS${k === 'SG' ? ' (MAS memakai kebijakan nilai tukar)' : ''}</span></td></tr>`;
    const last = s[s.length - 1];
    let i = s.length - 1; while (i > 0 && s[i - 1].value === last.value) i--;
    const prev = i > 0 ? s[i - 1] : null;
    return `<tr><th scope="row">${esc(name)} <span class="sub">${esc(k)}</span></th><td class="num">${Lineage.wrap({ label: 'Suku bunga kebijakan ' + name, value: fmt(last.value, 2), unit: '%', quality: r.stale ? 'stale' : 'historical', source: 'BIS WS_CBPOL', home: SOURCE_DEFS.bis.home, asOf: last.period, period: 'bulanan', fetchedAt: r.fetchedAt, via: r.via }, fmt(last.value, 2) + '%')}</td><td class="num">${prev ? fmt(prev.value, 2) + '%' : '–'}</td><td>${esc(s[i].period)}</td></tr>`;
  }).join('');
  _cbHtml = `<h3 class="mk-h3">Suku bunga kebijakan bank sentral ${qBadge(r.stale ? 'stale' : 'historical', 'BIS, data bulanan')}</h3><div class="table-wrap"><table class="dense static"><thead><tr><th scope="col">Bank sentral</th><th scope="col" class="num">Terakhir</th><th scope="col" class="num">Sebelumnya</th><th scope="col">Berlaku sejak</th></tr></thead><tbody>${rows}</tbody></table></div><p class="src-foot">${srcLine(r, 'bulanan; rapat berikutnya dan pernyataan resmi tidak tersedia dari API gratis')}</p>`;
  box.innerHTML = _cbHtml;
}
const RatesPage = MarketList.make({
  id: 'rates', prefix: 'mkRates', type: 'rate', title: 'Suku bunga dan obligasi', valueLabel: 'Imbal hasil / tingkat (%)', bp: true, def: 'rate:US10Y', tf: '1Y',
  dp: () => 2,
  note: 'Sumber: FRED (St. Louis Fed). Treasury, spread, TIPS, EFFR, SOFR = seri harian (kualitas "Harian", nilai akhir hari kerja sebelumnya). Obligasi 10 tahun negara lain = seri OECD bulanan (rata-rata bulan, kualitas "Historis"), bukan harga pasar harian. Perubahan dalam basis poin (1 bp = 0,01%) dibanding pengamatan sebelumnya. Suku bunga kebijakan: BIS, bulanan.',
  extra(S, el) {
    if (!el.querySelector('.mk-cb')) { el.innerHTML = '<div class="mk-rates-top"><div class="mk-curve-box"></div><div class="mk-cb"></div></div>'; cbTable(el); }
    el.querySelector('.mk-curve-box').innerHTML = curveSvg(S.rows);
  },
});
const FxPage = MarketList.make({
  id: 'fx', prefix: 'mkFx', type: 'fx', title: 'Valas', valueLabel: 'Kurs', def: 'fx:USDIDR', tf: '1Y',
  dp: (e, v) => priceDp(e, v),
  note: 'Kurs dari ExchangeRate-API / Frankfurter (ECB) adalah kurs referensi HARIAN, bukan kurs transaksi real-time; kualitasnya ditulis per baris. Grafik memakai riwayat FRED (H.10, harian) bila pasangan itu punya seri FRED, selain itu riwayat dari sumber kurs harian. Indeks dolar = indeks trade-weighted Federal Reserve (DTWEXBGS), bukan DXY milik ICE.',
});
const CmdtyPage = MarketList.make({
  id: 'cmdty', prefix: 'mkCmdty', type: 'commodity', title: 'Komoditas', valueLabel: 'Harga', def: 'commodity:WTI', tf: '1Y',
  dp: (e, v) => (v < 20 ? 2 : v < 1000 ? 2 : 0),
  note: 'Minyak WTI/Brent dan gas Henry Hub: FRED (EIA) harian. Logam, batu bara, pertanian: FRED (IMF Primary Commodity Prices) rata-rata BULANAN. Bila Yahoo tidak resmi diaktifkan di server, harga kontrak berjangka dipakai lebih dulu dan diberi label "Tidak resmi". Emas dan perak tidak ada di FRED gratis: tanpa Yahoo keduanya "Tidak tersedia", tidak ditebak.',
});
App.registerPage('rates', RatesPage, { group: 'riset', label: 'Suku bunga', short: 'Bunga', after: 'macro', icon: '<path d="M4 18c4-1 6-8 16-11"/><path d="M4 21h16"/>' });
App.registerPage('fx', FxPage, { group: 'riset', label: 'Valas', after: 'rates', icon: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>' });
App.registerPage('cmdty', CmdtyPage, { group: 'riset', label: 'Komoditas', short: 'Komod.', after: 'fx', icon: '<path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/>' });
