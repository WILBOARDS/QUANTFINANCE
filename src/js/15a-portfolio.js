/* =====================================================================
   PORTOFOLIO + RISIKO (perintah: PORT)
   - Posisi: { id entitas, jumlah, harga rata-rata, mata uang harga rata-rata } di localStorage
     (qt.portfolio). Harga dari Quotes.get (Datum: sumber, waktu, kualitas).
   - Konversi ke mata uang dasar (USD/IDR) memakai entitas valas nyata (Quotes.get), atau silang
     lewat USD. USDT -> USD memakai harga tether di CoinGecko. Kurs tidak ada = posisi tidak
     dijumlahkan dan alasannya ditulis. Tidak pernah 1:1 kecuali mata uangnya memang sama.
   - Risiko (shared/portfolio.mjs, diuji): hanya bila ada >= 60 imbal hasil harian yang selaras
     di semua posisi yang ikut. Posisi tanpa riwayat cukup atau dengan harga basi dikeluarkan dan
     didaftar. Tanpa simulasi, termasuk di Mode Demo.
   ===================================================================== */
const PortfolioPage = (() => {
  const PF = Portfolio;
  const KEY = 'portfolio';
  const POOL = 4;
  const PRICED = ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity'];
  const S = { built: false, seq: 0, base: Store.get('pfBase', 'USD'), quotes: new Map(), rates: new Map(), rows: [], risk: null };
  const load = () => { const v = Store.get(KEY, null); return v && Array.isArray(v.items) ? v : { items: [] }; };
  const save = p => Store.set(KEY, p);
  const curOf = (e, q) => (q && q.price && q.price.currency) || e.currency || 'USD';

  /* ---------- kurs: dari -> ke. Hasil { rate, source, asOf, fetchedAt, quality, path } atau { rate: null, reason } ---------- */
  async function directRate(from, to) {
    if (from === to) return { rate: 1, source: 'mata uang sama', path: from };
    if (from === 'USDT' && to === 'USD') {
      const c = await getData('coingecko', { server: '/api/crypto/markets?per=50', direct: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h', parse: Parsers.parseCoinGecko, ttl: 60e3, key: 'cgm' });
      const t = c.ok && c.data.find(x => x.id === 'tether');
      return t && Number.isFinite(t.price) ? { rate: t.price, source: 'CoinGecko (harga tether dalam USD)', asOf: t.updated, fetchedAt: c.fetchedAt, quality: c.stale ? 'stale' : 'delayed', path: 'USDT→USD' } : { rate: null, reason: 'harga USDT dalam USD (CoinGecko tether) tidak tersedia' };
    }
    const fwd = REG.get('fx:' + from + to), inv = REG.get('fx:' + to + from);
    const e = fwd || inv;
    if (!e) return { rate: null, reason: `tidak ada pasangan ${from}/${to} di katalog` };
    const q = await Quotes.get(e);
    const p = q && q.price;
    if (!p || p.value === null || !(p.value > 0)) return { rate: null, reason: `kurs ${e.symbol} tidak tersedia${q && q.reason ? ': ' + q.reason : ''}` };
    return { rate: fwd ? p.value : 1 / p.value, source: p.source + (fwd ? '' : ' (dibalik 1/x)'), asOf: p.asOf, fetchedAt: p.fetchedAt, quality: p.quality, path: e.symbol + (fwd ? '' : ' dibalik') };
  }
  async function rate(from, to) {
    const k = from + '>' + to;
    if (S.rates.has(k)) return S.rates.get(k);
    let r = await directRate(from, to);
    if (r.rate === null && from !== 'USD' && to !== 'USD') {
      const a = await rate(from, 'USD'), b = a.rate !== null ? await rate('USD', to) : null;
      if (a.rate !== null && b && b.rate !== null) r = { rate: a.rate * b.rate, source: a.source + ' × ' + b.source, asOf: [a.asOf, b.asOf].filter(Boolean).sort()[0], fetchedAt: [a.fetchedAt, b.fetchedAt].filter(Boolean).sort()[0], quality: [a.quality, b.quality].includes('stale') ? 'stale' : a.quality || b.quality, path: a.path + ' × ' + b.path };
      else r = { rate: null, reason: (a.rate === null ? a.reason : b.reason) + ' (silang lewat USD juga gagal)' };
    }
    S.rates.set(k, r);
    return r;
  }

  /* ---------- valuasi ---------- */
  async function valuate() {
    const my = ++S.seq, alive = () => my === S.seq && !$('#page-portfolio').hidden;
    const items = load().items;
    S.rates.clear();
    $('#pfMeta').innerHTML = items.length ? '<span class="loading sm">Menghitung</span>' : '';
    let i = 0;
    const out = new Array(items.length);
    const worker = async () => {
      while (i < items.length) {
        const k = i++, it = items[k], e = REG.get(it.id);
        if (!e) { out[k] = { it, e: null, why: 'entitas tidak dikenal di katalog' }; continue; }
        let q;
        try { q = await Quotes.get(e); } catch (err) { q = { ok: false, reason: err.message, price: datum(null, { reason: err.message }) }; }
        if (!alive()) return;
        const p = q.price || datum(null, { reason: q.reason });
        const cur = curOf(e, q);
        const row = { it, e, q, p, cur };
        if (p.value === null) { out[k] = { ...row, why: 'harga tidak tersedia: ' + (p.reason || q.reason || 'tanpa sumber') }; continue; }
        const fx = await rate(cur, S.base);
        const avgCur = it.cur || cur;
        const fxAvg = it.avg !== null && it.avg !== undefined ? await rate(avgCur, S.base) : null;
        if (!alive()) return;
        if (fx.rate === null) { out[k] = { ...row, why: `kurs ${cur}→${S.base} tidak tersedia: ${fx.reason}` }; continue; }
        const valueLocal = it.qty * p.value, value = valueLocal * fx.rate;
        const cost = fxAvg && fxAvg.rate !== null ? it.qty * it.avg * fxAvg.rate : null;
        out[k] = { ...row, fx, fxAvg, avgCur, valueLocal, value, cost, pl: cost !== null ? value - cost : null, plPct: cost > 0 ? (value - cost) / cost * 100 : null, stale: p.quality === 'stale' };
      }
    };
    await Promise.all(Array.from({ length: POOL }, worker));
    if (!alive()) return;
    S.rows = out;
    draw();
    risk(alive);
  }

  /* ---------- tampilan ---------- */
  const money = v => (Number.isFinite(v) ? fmt(v, S.base === 'IDR' ? 0 : 2) : '–');
  function rowLin(r) {
    return Lineage.wrap({ label: `Nilai ${r.e.symbol} (${S.base})`, value: money(r.value) + ' ' + S.base, quality: 'calculated', source: `${r.p.source} × kurs (${r.fx.source})`, asOf: r.p.asOf, fetchedAt: r.p.fetchedAt,
      formula: `jumlah × harga × kurs ${r.cur}→${S.base}`, note: `${fmt(r.it.qty, 6)} × ${fmt(r.p.value, 6)} ${r.cur} × ${fmt(r.fx.rate, 6)} (${r.fx.path}${r.fx.asOf ? ', kurs per ' + r.fx.asOf : ''})` }, esc(money(r.value)));
  }
  function draw() {
    const ok = S.rows.filter(r => r && Number.isFinite(r.value)), bad = S.rows.filter(r => r && !Number.isFinite(r.value));
    const total = ok.reduce((s, r) => s + r.value, 0);
    const withCost = ok.filter(r => r.cost !== null), plTot = withCost.reduce((s, r) => s + r.pl, 0), costTot = withCost.reduce((s, r) => s + r.cost, 0);
    $('#pfMeta').innerHTML = S.rows.length ? `Total ${esc(money(total))} ${esc(S.base)} ${qBadge('calculated', 'jumlah nilai posisi yang punya harga dan kurs')}${withCost.length ? ` · L/R belum terealisasi <span class="${sign(plTot)}">${esc(money(plTot))}</span> (${esc(fmtPct(costTot > 0 ? plTot / costTot : NaN, 2))})` : ''}` : '';
    if (!S.rows.length) { $('#pfBody').innerHTML = '<p class="empty">Belum ada posisi. Tambahkan lewat formulir di atas atau impor CSV (kolom: ticker, quantity, avg_price, currency).</p>'; $('#pfAlloc').innerHTML = ''; $('#pfRisk').innerHTML = ''; $('#pfExcluded').innerHTML = ''; return; }
    $('#pfBody').innerHTML = `<table class="dense pf-tbl"><caption class="sr">Posisi portofolio</caption><thead><tr><th scope="col">Kode</th><th scope="col" class="num">Jumlah</th><th scope="col" class="num">Harga</th><th scope="col">Kualitas</th><th scope="col" class="num">Nilai (${esc(S.base)})</th><th scope="col" class="num">Bobot</th><th scope="col" class="num">L/R (${esc(S.base)})</th><th scope="col" class="num">L/R %</th><th scope="col"><span class="sr">Aksi</span></th></tr></thead><tbody>
      ${S.rows.map((r, k) => !r ? '' : `<tr data-k="${k}"><th scope="row">${r.e ? `<button type="button" class="link-btn" data-pf-open>${esc(r.e.symbol)}</button><span class="sub">${esc(r.e.name)} · ${esc((REG.types && REG.types[r.e.type]) || r.e.type)}</span>` : esc(r.it.id)}</th>
        <td class="num">${esc(fmt(r.it.qty, r.it.qty < 1 ? 6 : 2))}</td>
        <td class="num">${r.p ? datumHtml(r.p, { dp: r.e ? priceDp(r.e, r.p.value) : 2, label: r.e ? r.e.symbol : '' }) + `<span class="sub">${esc(r.cur || '')}</span>` : '–'}</td>
        <td>${r.p ? datumAge(r.p) : qBadge('unavailable')}</td>
        <td class="num">${Number.isFinite(r.value) ? rowLin(r) : `<span class="na" title="${esc(r.why)}">tidak dijumlah</span>`}</td>
        <td class="num">${Number.isFinite(r.value) && total > 0 ? fmt(r.value / total * 100, 1) + '%' : '–'}</td>
        <td class="num">${r.pl !== null && r.pl !== undefined ? Lineage.wrap({ label: 'L/R ' + r.e.symbol, value: money(r.pl) + ' ' + S.base, quality: 'calculated', formula: 'nilai sekarang − (jumlah × harga rata-rata × kurs sekarang)', note: `harga rata-rata ${fmt(r.it.avg, 6)} ${r.avgCur}; kurs ${r.avgCur}→${S.base} = ${fmt(r.fxAvg.rate, 6)} (${r.fxAvg.path}). Efek kurs historis tidak dihitung.`, source: r.p.source }, `<span class="${sign(r.pl)}">${esc(money(r.pl))}</span>`) : `<span class="na" title="${esc(r.it.avg === null || r.it.avg === undefined ? 'harga rata-rata tidak diisi' : r.why || 'kurs harga rata-rata tidak tersedia')}">–</span>`}</td>
        <td class="num ${sign(r.plPct)}">${r.plPct !== null && r.plPct !== undefined ? esc(fmtPct(r.plPct / 100, 2)) : '–'}</td>
        <td class="pf-act"><button type="button" class="mini-btn" data-pf-edit>Ubah</button><button type="button" class="mini-btn" data-pf-del aria-label="Hapus ${esc(r.e ? r.e.symbol : r.it.id)}">Hapus</button></td></tr>`).join('')}</tbody></table>`;
    $('#pfExcluded').innerHTML = bad.length ? `<div class="na-box"><div>${qBadge('unavailable')} <strong>${bad.length} posisi tidak dijumlahkan</strong></div><ul>${bad.map(r => `<li>${esc(r.e ? r.e.symbol : r.it.id)}: ${esc(r.why)}</li>`).join('')}</ul></div>` : '';
    /* alokasi */
    const by = fn => PF.allocation(ok.map(r => ({ key: fn(r), value: r.value })));
    const bars = (title, list) => `<h3 class="fa-h3">${esc(title)}</h3><div class="pf-bars" role="list">${list.map(a => `<div class="pf-bar" role="listitem"><span class="pf-bl">${esc(a.key)}</span><span class="pf-bt"><i style="inline-size:${(a.share * 100).toFixed(1)}%"></i></span><span class="pf-bv">${fmt(a.share * 100, 1)}%</span></div>`).join('')}</div>`;
    const ctry = r => (r.e.type === 'crypto' ? 'Kripto (tanpa negara)' : r.e.type === 'fx' ? 'Valas' : r.e.type === 'commodity' ? 'Komoditas global' : (C2.get(r.e.country) || { name: r.e.country || '–' }).name);
    $('#pfAlloc').innerHTML = ok.length ? `<h3 class="fa-h3">Alokasi ${qBadge('calculated', 'bobot = nilai dalam mata uang dasar ÷ total')}</h3>` + bars('Per posisi', by(r => r.e.symbol)) + bars('Per jenis aset', by(r => (REG.types && REG.types[r.e.type]) || r.e.type)) + bars('Per mata uang harga', by(r => r.cur)) + bars('Per negara (eksposur)', by(ctry)) : '';
  }

  /* ---------- risiko ---------- */
  async function risk(alive) {
    const el = $('#pfRisk');
    const ok = S.rows.filter(r => r && Number.isFinite(r.value));
    if (!ok.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<p class="loading">Mengambil riwayat harga untuk risiko</p>';
    const series = {}, out = [];
    for (const r of ok) {
      if (r.stale) { out.push({ r, why: 'harga basi (Basi): dikeluarkan dari perhitungan risiko' }); continue; }
      const h = await Quotes.history(r.e, '1Y').catch(err => ({ bars: [], error: err.message }));
      if (!alive()) return;
      const m = PF.dailyCloses(h.bars || []);
      if (m.size < PF.MIN_RETURNS + 1) { out.push({ r, why: `riwayat harian kurang (${m.size} hari; butuh ≥ ${PF.MIN_RETURNS + 1})${h.error ? ': ' + h.error : ''}` }); continue; }
      series[r.e.id] = m;
    }
    const spx = REG.get('index:SPX');
    const bh = spx ? await Quotes.history(spx, '1Y').catch(() => ({ bars: [] })) : { bars: [] };
    if (!alive()) return;
    const ids = Object.keys(series);
    const excl = out.length ? `<p class="hint">Dikeluarkan dari risiko: ${out.map(x => `<b>${esc(x.r.e.symbol)}</b> (${esc(x.why)})`).join('; ')}.</p>` : '';
    const al = PF.align(series);
    const nRet = Math.max(0, al.dates.length - 1);
    if (!ids.length || nRet < PF.MIN_RETURNS) {
      el.innerHTML = `<h3 class="fa-h3">Risiko ${qBadge('unavailable')}</h3><div class="na-box"><p>Data kurang: butuh minimal ${PF.MIN_RETURNS} imbal hasil harian yang tanggalnya sama di semua posisi yang ikut; tersedia ${nRet}${ids.length ? ' (' + ids.length + ' posisi)' : ''}. Risiko tidak dihitung, bukan ditebak.</p></div>${excl}`;
      return;
    }
    const rets = Object.fromEntries(ids.map(id => [id, PF.returns(al.prices[id])]));
    const w = Object.fromEntries(ok.filter(r => series[r.e.id]).map(r => [r.e.id, r.value]));
    const pr = PF.portfolioReturns(rets, w);
    const vol = PF.annualVol(pr), mdd = PF.maxDrawdown(pr), v = PF.historicalVaR(pr, 0.95);
    let betaTxt = '–', betaNote = 'S&P 500 tidak punya riwayat harian di sumber yang aktif';
    const bm = PF.dailyCloses(bh.bars || []);
    if (bm.size > PF.MIN_RETURNS) {
      const al2 = PF.align({ ...series, __b: bm });
      if (al2.dates.length - 1 >= PF.MIN_RETURNS) {
        const r2 = Object.fromEntries(ids.map(id => [id, PF.returns(al2.prices[id])]));
        const b = PF.beta(PF.portfolioReturns(r2, w), PF.returns(al2.prices.__b));
        if (Number.isFinite(b)) { betaTxt = fmt(b, 2); betaNote = `acuan S&P 500 (${bh.source || ''}), ${al2.dates.length - 1} imbal hasil harian bersama`; }
      } else betaNote = `tanggal bersama dengan S&P 500 hanya ${al2.dates.length - 1} (butuh ≥ ${PF.MIN_RETURNS})`;
    }
    const base = { quality: 'calculated', source: 'Kalkulasi dari riwayat harga posisi', asOf: al.dates[al.dates.length - 1], period: `${nRet} imbal hasil harian, ${al.dates[0]} s/d ${al.dates[al.dates.length - 1]}` };
    const L = (label, txt, formula, note) => Lineage.wrap({ ...base, label, value: txt, formula, note }, esc(txt));
    const cm = PF.corrMatrix(rets);
    const sym = id => (REG.get(id) || { symbol: id }).symbol;
    el.innerHTML = `<h3 class="fa-h3">Risiko ${qBadge('calculated')}</h3>
      <dl class="kv">
        <div><dt>Volatilitas tahunan</dt><dd>${L('Volatilitas tahunan portofolio', fmt(vol * 100, 2) + '%', 'simpangan baku sampel imbal hasil harian × √252')}</dd><small>${nRet} hari</small></div>
        <div><dt>Drawdown maksimum</dt><dd>${L('Drawdown maksimum', fmt(mdd * 100, 2) + '%', 'penurunan terdalam kurva ∏(1 + r) dari puncak sebelumnya')}</dd><small>dalam jendela</small></div>
        <div><dt>VaR historis 1 hari 95%</dt><dd>${L('VaR 95% 1 hari', fmt(v.var * 100, 2) + '%', '−(kuantil 5% imbal hasil harian historis, metode lower)', `≈ ${money(v.var * ok.filter(r => series[r.e.id]).reduce((s, r) => s + r.value, 0))} ${S.base} pada nilai sekarang`)}</dd><small>kerugian 1 hari yang terlampaui ±5% hari</small></div>
        <div><dt>Expected shortfall 95%</dt><dd>${L('Expected shortfall 95%', fmt(v.es * 100, 2) + '%', '−rata-rata imbal hasil harian ≤ kuantil 5%', v.tail + ' hari di ekor')}</dd><small>rata-rata hari terburuk</small></div>
        <div><dt>Beta</dt><dd>${betaTxt === '–' ? `<span class="na" title="${esc(betaNote)}">–</span>` : L('Beta terhadap S&P 500', betaTxt, 'kovarians(portofolio, acuan) ÷ varians(acuan)', betaNote)}</dd><small>${esc(betaNote)}</small></div>
      </dl>
      ${ids.length > 1 ? `<h3 class="fa-h3">Korelasi imbal hasil harian</h3><div class="table-wrap"><table class="dense static pf-corr"><thead><tr><th></th>${cm.ids.map(id => `<th scope="col" class="num">${esc(sym(id))}</th>`).join('')}</tr></thead><tbody>${cm.ids.map((a, i) => `<tr><th scope="row">${esc(sym(a))}</th>${cm.m[i].map(x => `<td class="num">${Number.isFinite(x) ? fmt(x, 2) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      ${excl}
      <p class="hint">Metodologi: imbal hasil harian sederhana dari harga penutupan; hanya tanggal yang dimiliki semua posisi (tanggal hilang dibuang, tidak diisi); bobot = nilai sekarang, tetap sepanjang jendela; imbal hasil dalam mata uang masing-masing aset (efek kurs historis tidak dimasukkan). Riwayat masa lalu tidak menjamin risiko masa depan.</p>`;
  }

  /* ---------- formulir, impor/ekspor ---------- */
  function resolve(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    return REG.resolve(t, PRICED) || ((REG.search(t, { types: PRICED, limit: 1 })[0] || {}).entity) || null;
  }
  function upsert(e, qty, avg, cur) {
    const p = load();
    const i = p.items.findIndex(x => x.id === e.id);
    const item = { id: e.id, qty, avg, cur: cur || null };
    if (i >= 0) p.items[i] = item; else p.items.push(item);
    save(p);
  }
  function build() {
    if (S.built) return;
    S.built = true;
    $('#pfBase').value = S.base;
    $('#pfBase').addEventListener('change', ev => { S.base = ev.target.value; Store.set('pfBase', S.base); valuate(); });
    $('#pfRefresh').addEventListener('click', valuate);
    $('#pfSym').addEventListener('input', ev => {
      const q = ev.target.value.trim();
      $('#pfSymList').innerHTML = q ? REG.search(q, { types: PRICED, limit: 8 }).map(r => `<option value="${esc(r.entity.symbol)}">${esc(r.entity.name)}</option>`).join('') : '';
    });
    $('#pfForm').addEventListener('submit', ev => {
      ev.preventDefault();
      const e = resolve($('#pfSym').value), qty = PF.parseNum($('#pfQty').value), avgRaw = $('#pfAvg').value.trim(), avg = avgRaw ? PF.parseNum(avgRaw) : null;
      const msg = $('#pfMsg');
      if (!e) { msg.textContent = 'Kode tidak dikenal atau tidak punya harga.'; return; }
      if (!(qty > 0)) { msg.textContent = 'Jumlah harus angka > 0.'; return; }
      if (avgRaw && !(avg >= 0)) { msg.textContent = 'Harga rata-rata harus angka ≥ 0.'; return; }
      upsert(e, qty, avg, $('#pfCur').value || null);
      msg.textContent = `${e.symbol} disimpan.`;
      $('#pfForm').reset();
      valuate();
    });
    $('#pfBody').addEventListener('click', ev => {
      const tr = ev.target.closest('tr[data-k]'); if (!tr) return;
      const r = S.rows[+tr.dataset.k]; if (!r) return;
      if (ev.target.closest('[data-pf-open]') && r.e) { SecurityPage.open(r.e, 'overview'); App.showPage('security'); return; }
      if (ev.target.closest('[data-pf-del]')) { const p = load(); p.items = p.items.filter(x => x.id !== r.it.id); save(p); $('#pfMsg').textContent = (r.e ? r.e.symbol : r.it.id) + ' dihapus.'; valuate(); return; }
      if (ev.target.closest('[data-pf-edit]') && r.e) { $('#pfSym').value = r.e.symbol; $('#pfQty').value = String(r.it.qty); $('#pfAvg').value = r.it.avg ?? ''; $('#pfCur').value = r.it.cur || ''; $('#pfQty').focus(); }
    });
    $('#pfExport').addEventListener('click', () => {
      download('portofolio.csv', toCsv([['ticker', 'quantity', 'avg_price', 'currency', 'harga', 'mata_uang_harga', 'kualitas_harga', 'waktu_harga', 'sumber_harga', 'kurs_ke_' + S.base, 'sumber_kurs', 'nilai_' + S.base, 'lr_' + S.base, 'catatan'],
        ...S.rows.filter(Boolean).map(r => [r.e ? r.e.symbol : r.it.id, r.it.qty, r.it.avg ?? '', r.it.cur || '', r.p ? r.p.value : '', r.cur || '', r.p ? r.p.quality : 'unavailable', r.p ? r.p.asOf || '' : '', r.p ? r.p.source || '' : '', r.fx ? r.fx.rate : '', r.fx ? r.fx.source : '', Number.isFinite(r.value) ? r.value : '', r.pl ?? '', r.why || ''])]), 'text/csv');
    });
    $('#pfImport').addEventListener('change', async ev => {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      if (f.size > 512 * 1024) { $('#pfMsg').textContent = 'File terlalu besar (maks 512 KB).'; return; }
      let res;
      try { res = PF.holdingsFromCsv(await f.text()); } catch (err) { $('#pfMsg').textContent = 'CSV tidak bisa dibaca: ' + err.message; return; }
      const unknown = [];
      for (const h of res.holdings) { const e = resolve(h.symbol); if (e) upsert(e, h.qty, h.avg, h.cur); else unknown.push(h.symbol); }
      $('#pfMsg').textContent = `${res.holdings.length - unknown.length} posisi diimpor${unknown.length ? '; tidak dikenal: ' + unknown.join(', ') : ''}${res.errors.length ? '; dilewati: ' + res.errors.slice(0, 3).join('; ') + (res.errors.length > 3 ? '…' : '') : ''}.`;
      valuate();
    });
  }
  return {
    show() { build(); valuate(); },
    hide() { S.seq++; },
    get state() { return { items: load().items.length, rows: S.rows.length, valued: S.rows.filter(r => r && Number.isFinite(r.value)).length }; },
  };
})();
App.registerPage('portfolio', PortfolioPage, { group: 'portofolio', label: 'Portofolio', short: 'Porto', icon: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/><circle cx="16" cy="8" r="2"/>' });
