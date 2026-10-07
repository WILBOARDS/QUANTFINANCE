/* =====================================================================
   KRIPTO: tab Transaksi, Derivatif, On-chain di detail aset (jenis kripto)
   Data dipisah dan diberi label berbeda:
     - data bursa: Binance spot aggTrades (transaksi terbaru) — lewat server atau langsung
     - data bursa derivatif: Binance USD-M futures (funding, open interest) — lewat server
     - data on-chain: mempool.space (Bitcoin saja) — lewat server
     - kalkulasi aplikasi: transaksi besar, volume taker beli/jual, funding disetahunkan, perubahan OI
   "Transaksi besar" = nilai transaksi di atas ambang di SATU bursa. Bukan identitas pelaku,
   bukan "whale", bukan "smart money". Tidak ada lapisan "whale" di globe: tidak ada dasar data
   untuk menentukan lokasi pemilik dompet/akun.
   ===================================================================== */
SOURCE_DEFS.binancefut = { name: 'Binance USD-M futures', kind: 'Derivatif kripto', direct: false, server: true, auth: 'tanpa kunci', quality: 'live', home: 'https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info', limit: 'di-cache 15 detik' };
SOURCE_DEFS.mempool = { name: 'mempool.space', kind: 'On-chain Bitcoin', direct: false, server: true, auth: 'tanpa kunci', quality: 'live', home: 'https://mempool.space/docs/api/rest', limit: 'di-cache 30–60 detik' };
for (const k of ['binancefut', 'mempool']) if (!SourceState[k]) SourceState[k] = { status: 'idle', requests: 0, cacheHits: 0, errors: 0, latency: null, lastOk: null, lastErr: null, lastErrMsg: '', via: null };

const CryptoTabs = (() => {
  const X = Cryptox;
  const symOf = e => (e.providers && e.providers.binance) || '';
  const tsUtc = ms => new Date(ms).toISOString().slice(11, 19) + ' UTC';
  const noBinance = (e, what) => unavailableBox(what + ' ' + e.symbol, { error: `${e.name} tidak punya pasangan Binance di katalog aplikasi ini, jadi data bursa/derivatifnya tidak tersedia.` });
  const kind = (label, q) => `<span class="cx-kind">${qBadge(q)} ${esc(label)}</span>`;

  /* ---------- Transaksi ---------- */
  const thrKey = s => 'cxThr:' + s;
  function tradesHtml(e, r, thr) {
    const t = r.data, s = symOf(e), quote = s.endsWith('USDT') ? 'USDT' : s.slice(-3);
    const q = r.stale ? 'stale' : 'live';
    const big = X.largeTrades(t, thr), flow = X.takerFlow(t), bigFlow = X.takerFlow(big);
    const last = t.slice(-40).reverse();
    const dp = t.length && t[t.length - 1].price < 10 ? 4 : 2;
    const pct = v => (v === null ? '–' : fmt(v * 100, 1) + '%');
    const flowLin = (f, label) => Lineage.wrap({ label, value: pct(f.buyShare), quality: 'calculated', source: r.source + ' aggTrades', fetchedAt: r.fetchedAt, asOf: f.to ? new Date(f.to).toISOString() : null, formula: 'nilai taker beli ÷ (taker beli + taker jual); taker beli = aggTrades dengan m=false', note: `beli ${fmtCompact(f.buy)} ${quote}, jual ${fmtCompact(f.sell)} ${quote}, ${f.n} transaksi` }, esc(pct(f.buyShare)));
    const row = x => `<tr><td class="num">${esc(tsUtc(x.time))}</td><td class="${x.side === 'buy' ? 'up' : 'down'}">${x.side === 'buy' ? 'taker beli' : 'taker jual'}</td><td class="num">${fmt(x.price, dp)}</td><td class="num">${fmt(x.qty, x.qty < 1 ? 5 : 3)}</td><td class="num">${fmtCompact(x.quote)}</td></tr>`;
    const head = `<thead><tr><th scope="col">Waktu</th><th scope="col">Sisi pemicu</th><th scope="col" class="num">Harga</th><th scope="col" class="num">Jumlah</th><th scope="col" class="num">Nilai (${esc(quote)})</th></tr></thead>`;
    const span = flow.n ? Math.max(1, Math.round((flow.to - flow.from) / 1000)) : 0;
    return `<p class="cx-line">${kind('data bursa Binance spot', q)} ${esc(t.length)} transaksi gabungan terakhir (${span ? 'rentang ±' + (span >= 120 ? Math.round(span / 60) + ' menit' : span + ' detik') : '–'}) · ${srcLine(r)}</p>
      <div class="cx-cards">
        <div><dt>Porsi taker beli (semua)</dt><dd>${flowLin(flow, 'Porsi taker beli ' + e.symbol)}</dd><small>${qBadge('calculated')} dari ${flow.n} transaksi</small></div>
        <div><dt>Transaksi ≥ ${esc(fmtCompact(thr))} ${esc(quote)}</dt><dd>${big.length}</dd><small>${qBadge('calculated')} nilai ${esc(fmtCompact(bigFlow.total))} ${esc(quote)}</small></div>
        <div><dt>Porsi taker beli (besar)</dt><dd>${big.length ? flowLin(bigFlow, 'Porsi taker beli transaksi besar ' + e.symbol) : '–'}</dd><small>${qBadge('calculated')} hanya transaksi besar</small></div>
      </div>
      <form class="cx-thr" data-cx-thr><label for="cxThr">Ambang transaksi besar (${esc(quote)})</label><input id="cxThr" type="number" min="1000" step="1000" inputmode="numeric" value="${thr}"><button type="submit" class="mini-btn">Terapkan</button><button type="button" class="mini-btn" data-cx-thr-reset>Bawaan (${esc(fmtCompact(X.defaultThreshold(s)))})</button></form>
      <h3 class="fa-h3">Transaksi besar terukur di Binance ${qBadge('calculated')}</h3>
      ${big.length ? `<div class="table-wrap"><table class="dense static cx-tbl"><caption class="sr">Transaksi besar ${esc(e.symbol)}</caption>${head}<tbody>${big.slice(0, 30).map(row).join('')}</tbody></table></div>` : `<p class="hint">Tidak ada transaksi ≥ ${esc(fmtCompact(thr))} ${esc(quote)} dalam ${t.length} transaksi terakhir.</p>`}
      <h3 class="fa-h3">Transaksi terbaru ${qBadge(q)}</h3>
      <div class="table-wrap"><table class="dense static cx-tbl"><caption class="sr">Transaksi terbaru ${esc(e.symbol)}</caption>${head}<tbody>${last.map(row).join('')}</tbody></table></div>
      <p class="hint">"Sisi pemicu" = siapa yang memukul harga di buku order Binance (field <code>m</code>: true = pembeli sebagai maker, jadi penjual yang memicu). Ini bukan identitas atau niat pelaku. "Transaksi besar" hanya berarti nilainya di atas ambang di satu bursa; satu pelaku bisa memecah order, dan transaksi besar di bursa lain tidak terlihat di sini. Bukan sinyal "whale" atau "smart money".</p>`;
  }
  SecurityTabs.register({
    id: 'trades', label: 'Transaksi', verb: null, types: ['crypto'], order: 13,
    async render(e, el, ctx) {
      const s = symOf(e);
      if (!s) { el.innerHTML = noBinance(e, 'Transaksi'); return; }
      let thr = Store.get(thrKey(s), X.defaultThreshold(s));
      el.innerHTML = '<p class="loading">Mengambil transaksi Binance</p>';
      const r = await getData('binance', { server: '/api/crypto/trades?symbol=' + s, direct: 'https://api.binance.com/api/v3/aggTrades?symbol=' + s + '&limit=500', parse: X.parseAggTrades, ttl: 5000, key: 'agg:' + s });
      if (!ctx.alive()) return;
      if (!r.ok || !Array.isArray(r.data) || !r.data.length) { el.innerHTML = unavailableBox('Transaksi ' + e.symbol + ' (Binance)', r.ok ? { error: 'Binance tidak mengembalikan transaksi.' } : r); return; }
      /* #secBody dipakai ulang semua tab: pendengar dipasang di pembungkus baru yang ikut hilang saat tab berganti */
      el.innerHTML = '<div class="cx-wrap"></div>';
      const box = el.firstElementChild;
      const draw = () => { box.innerHTML = tradesHtml(e, r, thr); };
      draw();
      box.addEventListener('submit', ev => {
        if (!ev.target.matches('[data-cx-thr]')) return;
        ev.preventDefault();
        const inp = box.querySelector('#cxThr'), v = Math.round(+inp.value);
        if (!(v >= 1000 && v <= 1e10)) { inp.setCustomValidity('Ambang 1.000 sampai 10 miliar'); inp.reportValidity(); inp.addEventListener('input', () => inp.setCustomValidity(''), { once: true }); return; }
        thr = v; Store.set(thrKey(s), thr); draw();
      });
      box.addEventListener('click', ev => { if (ev.target.closest('[data-cx-thr-reset]')) { thr = X.defaultThreshold(s); Store.set(thrKey(s), thr); draw(); } });
    },
  });

  /* ---------- Derivatif ---------- */
  SecurityTabs.register({
    id: 'derivs', label: 'Derivatif', verb: null, types: ['crypto'], order: 14,
    async render(e, el, ctx) {
      const s = symOf(e);
      if (!s) { el.innerHTML = noBinance(e, 'Derivatif'); return; }
      if (!Net.checked) await Net.ready();
      if (!Net.server) { el.innerHTML = unavailableBox('Derivatif ' + e.symbol, { error: 'Data futures Binance diambil lewat server lokal (npm start).' }); return; }
      el.innerHTML = '<p class="loading">Mengambil data futures Binance</p>';
      const r = await getData('binancefut', { server: '/api/crypto/derivs?symbol=' + s + '&period=1h', ttl: 15000, key: 'fut:' + s });
      if (!ctx.alive()) return;
      if (!r.ok) { el.innerHTML = unavailableBox('Derivatif ' + e.symbol + ' (Binance USD-M)', r, /Invalid symbol|400/.test(r.error || '') ? 'Pasangan ini mungkin tidak punya kontrak perpetual USD-M di Binance.' : ''); return; }
      const d = r.data, p = d.premium, q = r.stale ? 'stale' : 'live';
      const ann = X.annualizeFunding(p.fundingRate);
      const ch = X.oiChange(d.hist || []);
      const base = e.symbol;
      const L = (o, html) => Lineage.wrap({ source: 'Binance USD-M futures', home: SOURCE_DEFS.binancefut.home, fetchedAt: r.fetchedAt, via: 'server', ...o }, html);
      const oiVal = Number.isFinite(d.oi.oi) && Number.isFinite(p.markPrice) ? d.oi.oi * p.markPrice : null;
      const spark = (d.hist || []).length > 1 ? (() => {
        const h = d.hist, W = 300, H = 60, lo = Math.min(...h.map(x => x.oi)), hi = Math.max(...h.map(x => x.oi)), k = hi > lo ? hi - lo : 1;
        return `<svg class="cx-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Open interest ${esc(base)} ${h.length} jam terakhir"><path d="${h.map((x, i) => (i ? 'L' : 'M') + (i / (h.length - 1) * W).toFixed(1) + ' ' + (H - 4 - (x.oi - lo) / k * (H - 8)).toFixed(1)).join(' ')}" fill="none" stroke="#6fb1ff" stroke-width="1.6"/></svg>`;
      })() : '';
      el.innerHTML = `<p class="cx-line">${kind('data bursa derivatif Binance (kontrak perpetual USD-M ' + s + ')', q)} ${srcLine(r)}</p>
        <dl class="kv three">
          <div><dt>Funding terakhir (per periode)</dt><dd>${Number.isFinite(p.fundingRate) ? L({ label: 'Funding rate ' + s, value: fmt(p.fundingRate * 100, 4) + '%', quality: q, asOf: p.time ? new Date(p.time).toISOString() : null, url: r.sourceUrl, note: 'lastFundingRate dari /fapi/v1/premiumIndex' }, esc(fmt(p.fundingRate * 100, 4) + '%')) : '–'}</dd><small>${qBadge(q)} bayar berikut ${p.nextFundingTime ? esc(new Date(p.nextFundingTime).toISOString().slice(11, 16)) + ' UTC' : '–'}</small></div>
          <div><dt>Funding disetahunkan</dt><dd>${ann === null ? '–' : L({ label: 'Funding disetahunkan ' + s, value: fmt(ann, 2) + '%', quality: 'calculated', formula: 'funding per periode × 3 periode per hari × 365 (asumsi interval 8 jam)', note: 'Sebagian kontrak memakai interval 4 jam; angka ini asumsi 8 jam. Bukan imbal hasil yang dijamin.' }, esc(fmt(ann, 2) + '%'))}</dd><small>${qBadge('calculated')} asumsi interval 8 jam</small></div>
          <div><dt>Selisih mark − indeks</dt><dd>${Number.isFinite(p.markPrice) && Number.isFinite(p.indexPrice) && p.indexPrice > 0 ? L({ label: 'Basis mark/indeks ' + s, value: fmt((p.markPrice / p.indexPrice - 1) * 100, 3) + '%', quality: 'calculated', formula: 'mark price ÷ index price − 1', note: `mark ${p.markPrice}, indeks ${p.indexPrice}` }, esc(fmt((p.markPrice / p.indexPrice - 1) * 100, 3) + '%')) : '–'}</dd><small>${qBadge('calculated')}</small></div>
          <div><dt>Open interest</dt><dd>${L({ label: 'Open interest ' + s, value: fmt(d.oi.oi, 2) + ' ' + base, quality: d.oiStale ? 'stale' : q, asOf: d.oi.time ? new Date(d.oi.time).toISOString() : null, fetchedAt: d.oiFetchedAt, note: '/fapi/v1/openInterest, dalam satuan koin' }, esc(fmtCompact(d.oi.oi) + ' ' + base))}</dd><small>${qBadge(d.oiStale ? 'stale' : q)} kontrak terbuka</small></div>
          <div><dt>Nilai open interest</dt><dd>${oiVal === null ? '–' : L({ label: 'Nilai OI ' + s, value: fmtCompact(oiVal) + ' USDT', quality: 'calculated', formula: 'open interest (koin) × mark price' }, esc(fmtCompact(oiVal) + ' USDT'))}</dd><small>${qBadge('calculated')}</small></div>
          <div><dt>Perubahan OI ${d.hist ? d.hist.length + ' jam' : ''}</dt><dd>${ch && ch.pct !== null ? L({ label: 'Perubahan OI ' + s, value: fmtPct(ch.pct / 100, 2), quality: 'calculated', formula: 'OI terakhir ÷ OI pertama riwayat − 1', fetchedAt: d.histFetchedAt, note: `dari ${fmt(ch.first, 0)} ke ${fmt(ch.last, 0)} ${base}` }, `<span class="${sign(ch.pct)}">${esc(fmtPct(ch.pct / 100, 2))}</span>`) : `<span class="na" title="${esc(d.histError || 'riwayat kurang')}">–</span>`}</dd><small>${qBadge('calculated')} /futures/data/openInterestHist</small></div>
        </dl>
        ${spark ? `<figure class="cx-fig">${spark}<figcaption class="meta">Open interest per jam (Binance), ${d.hist.length} titik</figcaption></figure>` : ''}
        <p class="hint">Hanya satu bursa (Binance). Funding positif berarti posisi long membayar short pada periode itu; ini data bursa, bukan prediksi arah harga. Open interest bursa lain dan opsi tidak termasuk. Likuidasi tidak tersedia dari API publik yang stabil.</p>`;
    },
  });

  /* ---------- On-chain ---------- */
  SecurityTabs.register({
    id: 'onchain', label: 'On-chain', verb: null, types: ['crypto'], order: 15,
    async render(e, el, ctx) {
      if (e.symbol !== 'BTC') {
        el.innerHTML = unavailableBox('Data on-chain ' + e.symbol, { error: `Belum tersedia. Aplikasi ini baru memakai mempool.space (API publik gratis) yang khusus Bitcoin. Data on-chain ${e.name} butuh penyedia lain (explorer jaringan itu atau layanan analitik on-chain, yang umumnya berbayar).` });
        return;
      }
      if (!Net.checked) await Net.ready();
      if (!Net.server) { el.innerHTML = unavailableBox('On-chain Bitcoin', { error: 'Data mempool.space diambil lewat server lokal (npm start).' }); return; }
      el.innerHTML = '<p class="loading">Mengambil data mempool.space</p>';
      const r = await getData('mempool', { server: '/api/onchain/btc', ttl: 30000, key: 'mp:btc' });
      if (!ctx.alive()) return;
      if (!r.ok) { el.innerHTML = unavailableBox('On-chain Bitcoin (mempool.space)', r); return; }
      const d = r.data, q = r.stale ? 'stale' : 'live', f = d.fees;
      const L = (o, html) => Lineage.wrap({ source: 'mempool.space', home: SOURCE_DEFS.mempool.home, fetchedAt: r.fetchedAt, via: 'server', quality: q, ...o }, html);
      const iv = X.blockInterval(d.blocks);
      el.innerHTML = `<p class="cx-line">${kind('data on-chain Bitcoin (mempool.space)', q)} ${srcLine(r)}</p>
        <h3 class="fa-h3">Biaya transaksi yang disarankan (sat/vB)</h3>
        <dl class="kv three">${[['fastestFee', 'Tercepat (blok berikut)'], ['halfHourFee', '±30 menit'], ['hourFee', '±1 jam'], ['economyFee', 'Ekonomis'], ['minimumFee', 'Minimum']].map(([k, l]) => `<div><dt>${esc(l)}</dt><dd>${f[k] === null ? '–' : L({ label: 'Biaya ' + l, value: f[k] + ' sat/vB', note: '/api/v1/fees/recommended' }, esc(f[k]))}</dd><small>${qBadge(q)}</small></div>`).join('')}
          <div><dt>Transaksi di mempool</dt><dd>${d.mempool ? L({ label: 'Jumlah transaksi mempool', value: fmt(d.mempool.count, 0), note: '/api/mempool' }, esc(fmt(d.mempool.count, 0))) : `<span class="na" title="${esc(d.mempoolError || '')}">–</span>`}</dd><small>${d.mempool ? esc(fmt((d.mempool.vsize || 0) / 1e6, 1)) + ' juta vB' : 'tidak tersedia'}</small></div></dl>
        <h3 class="fa-h3">Blok terbaru</h3>
        <div class="table-wrap"><table class="dense static cx-tbl"><caption class="sr">Blok Bitcoin terbaru</caption><thead><tr><th scope="col" class="num">Tinggi</th><th scope="col">Waktu (UTC)</th><th scope="col" class="num">Transaksi</th><th scope="col" class="num">Ukuran</th></tr></thead><tbody>
          ${d.blocks.map(b => `<tr><td class="num"><a href="${safeUrl('https://mempool.space/block/' + (b.id || b.height))}" target="_blank" rel="noopener noreferrer">${esc(b.height)}</a></td><td>${esc(new Date(b.time).toISOString().slice(0, 16).replace('T', ' '))}</td><td class="num">${b.txCount === null ? '–' : fmt(b.txCount, 0)}</td><td class="num">${b.size === null ? '–' : fmt(b.size / 1e6, 2) + ' MB'}</td></tr>`).join('')}</tbody></table></div>
        <p class="meta">Jarak rata-rata antar blok (${d.blocks.length} blok terakhir): ${iv === null ? '–' : L({ label: 'Jarak rata-rata antar blok', value: fmt(iv, 1) + ' menit', quality: 'calculated', formula: '(waktu blok terbaru − waktu blok tertua) ÷ (jumlah blok − 1)', note: 'cap waktu blok diatur penambang, bisa meleset beberapa menit' }, esc(fmt(iv, 1) + ' menit'))} ${qBadge('calculated')}</p>
        <p class="hint">Data jaringan Bitcoin dari node mempool.space. Aliran dana ke/dari bursa, saldo dompet besar, dan label pemilik alamat tidak tersedia dari API gratis ini, dan aplikasi tidak menebaknya.</p>`;
    },
  });
  return {};
})();
