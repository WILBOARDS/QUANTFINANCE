/* =====================================================================
   PANEL INTELIJEN ASET (kartu kanan-bawah halaman Pasar)
   - Kenapa bergerak? : bukti dari harga, volume, pasar, berita, rezim
   - Proksi smart money: insider + anomali volume + divergensi harga/volume
   - Fundamental, insider, earnings: Finnhub (saham AS, server + kunci gratis)
   - Order book kripto: Binance depth (publik)
   - Skor kesehatan v1 (Piotroski/Altman) hanya di mode demo (fundamental sintetis)
   ===================================================================== */
const AssetPanel = (() => {
  let cur = null, tab = Store.get('assetTab', 'why'), seq = 0;
  /* my = nomor urut render panel Pasar, ATAU fungsi alive() dari halaman detail aset */
  const live = my => (typeof my === 'function' ? my() : my === seq);
  /* saham AS yang punya kode Finnhub: daftar Pasar ATAU entitas katalog (i.finnhub) */
  const isUS = i => (i.type === 'stock' || i.type === 'etf') && i.sym !== 'VALE' && (US_STOCKS.includes(i.sym) || (!!i.finnhub && i.mkt === 'US'));
  const hasFinnhub = () => !!(Net.server && Net.server.health.keys.finnhub);

  function tabsFor(i) {
    const t = [['why', 'Kenapa bergerak?']];
    if (i.type === 'stock') t.push(['fund', 'Fundamental'], ['insider', 'Insider'], ['earnings', 'Earnings'], ['news', 'Berita']);
    if (i.type === 'crypto') t.push(['book', 'Order book'], ['news', 'Berita']);
    if (i.type === 'index') t.push(['index', 'Bursa'], ['news', 'Berita']);
    if (State.demo && i.type === 'stock') t.push(['health', 'Skor (demo)']);
    return t;
  }

  async function finn(kind, sym) {
    return getData('finnhub', { server: `/api/finnhub?kind=${kind}&symbol=${encodeURIComponent(sym)}`, ttl: kind === 'news' ? 15 * 60e3 : 6 * 3600e3, persist: kind !== 'news', key: `fh:${kind}:${sym}` });
  }
  const needFinnhub = i => unavailableBox(isUS(i) ? 'Butuh kunci Finnhub' : 'Belum ada sumber gratis untuk saham non-AS', { error: isUS(i) ? (Net.server ? 'FINNHUB_API_KEY belum diisi di .env server.' : 'Server lokal tidak tersambung.') : 'Fundamental, insider, dan earnings gratis yang andal hanya tersedia untuk saham AS (Finnhub). Data IDX/Asia/Eropa resmi berbayar.' },
    isUS(i) ? 'Daftar gratis di finnhub.io, isi FINNHUB_API_KEY di .env, lalu jalankan ulang <code>npm start</code>.' : '');

  /* ---------------- KENAPA BERGERAK ---------------- */
  async function why(i, el, my) {
    el.innerHTML = '<p class="loading">Mengumpulkan bukti</p>';
    const ev = [];
    const p = pct(i);
    /* mode demo: harga simulasi tidak boleh dipakai sebagai bukti analisis yang tampak nyata */
    const simP = !i.real || i.quality === 'sim';
    const h = await MarketData.history(i, '6M');
    if (!live(my)) return;
    const bars = h && h.bars ? h.bars : [];
    const closes = bars.map(b => b.close);
    const rets = Analytics.returns(closes);
    const sd = Analytics.stdev(rets.slice(-60));
    if (Number.isFinite(p) && Number.isFinite(sd) && sd > 0) {
      const z = p / sd;
      ev.push({ w: Math.min(Math.abs(z) / 3, 1), label: 'Besar pergerakan', txt: `Perubahan (${chgBasis(i)}) ${fmtPct(p)} = ${fmt(z, 1)}× volatilitas harian biasa (σ ${fmtPct(sd)} dari 60 hari). ${Math.abs(z) >= 2 ? 'Tidak biasa.' : Math.abs(z) >= 1 ? 'Agak besar.' : 'Masih dalam kisaran normal.'}`, src: simP ? h.source + ' vs harga simulasi (mode demo)' : h.source, q: simP ? 'sim' : 'calculated' });
    } else ev.push({ w: 0, label: 'Besar pergerakan', txt: Number.isFinite(p) ? `Perubahan (${chgBasis(i)}) ${fmtPct(p)}; riwayat untuk membandingkan volatilitas tidak tersedia.` : 'Harga hari ini tidak tersedia.', src: '', q: 'unavailable' });
    const vols = bars.map(b => b.volume).filter(v => v > 0);
    if (vols.length > 21 && Number.isFinite(i.volume) && i.volume > 0) {
      const avg = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      const ratio = vols[vols.length - 1] / avg;
      ev.push({ w: Math.min(Math.max(ratio - 1, 0) / 2, 1), label: 'Volume', txt: `Volume periode terakhir ${fmt(ratio, 2)}× rata-rata 20 periode. ${ratio > 2 ? 'Partisipasi sangat tinggi, biasanya ada kabar atau aliran dana besar.' : ratio > 1.3 ? 'Di atas rata-rata.' : 'Normal atau rendah: pergerakan kurang didukung volume.'}`, src: h.source, q: 'calculated' });
    } else ev.push({ w: 0, label: 'Volume', txt: 'Data volume historis tidak tersedia untuk sumber ini.', q: 'unavailable' });
    /* konteks pasar */
    const bench = i.type === 'crypto' ? BY.BTC : BY[(INDEX_DEFS.find(d => d[2] === i.mkt) || [])[0]];
    /* dibandingkan hanya bila keduanya data sesi yang sama (bukan penutupan FRED beberapa hari lalu vs harga live) */
    if (bench && bench !== i && Number.isFinite(pct(bench)) && Number.isFinite(p) && comparableMove(i, bench)) {
      const rel = p - pct(bench);
      ev.push({ w: Math.min(Math.abs(rel) / Math.max(sd || 0.01, 0.005) / 3, 1), label: 'Dibanding pasar', txt: `${bench.name} ${fmtPct(pct(bench))}; selisih ${fmtPct(rel)}. ${Math.abs(rel) < Math.abs(p) / 2 ? 'Sebagian besar gerak searah pasar (faktor pasar/makro).' : 'Bergerak berbeda dari pasar: kemungkinan faktor spesifik aset.'}`, src: bench.srcName, q: 'calculated' });
    } else ev.push({ w: 0, label: 'Dibanding pasar', txt: bench && bench.real && !comparableMove(i, bench) ? `Tidak dibandingkan: data ${bench.name} (${chgBasis(bench)}) bukan dari sesi yang sama dengan harga aset ini.` : 'Harga pembanding pasar tidak tersedia.', q: 'unavailable' });
    /* berita */
    const nm = i.type === 'index' ? i.name : i.name.split(' ')[0] === 'Bank' ? i.name : i.name.split(' ').slice(0, 2).join(' ');
    const query = `"${nm.replace(/[^\w\s&.-]/g, '')}" sourcelang:english`;
    /* GDELT dibatasi 1 permintaan per ~5 detik: tunggu sebentar supaya menelusuri daftar dengan
       panah tidak mengantrekan puluhan permintaan yang hasilnya tidak akan dipakai */
    if (!(isUS(i) && hasFinnhub())) { await new Promise(r => setTimeout(r, 600)); if (!live(my)) return; }
    const n = isUS(i) && hasFinnhub() ? await finn('news', i.sym) : await getData('gdelt', {
      server: '/api/gdelt/doc?' + new URLSearchParams({ query, mode: 'artlist', timespan: '24h', maxrecords: '50', sort: 'DateDesc' }),
      direct: 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({ query, mode: 'artlist', format: 'json', timespan: '24h', maxrecords: '50', sort: 'DateDesc' }),
      parse: Parsers.parseGdeltArticles, ttl: 20 * 60e3, persist: true, key: 'gda:' + i.sym, alive: () => live(my),
    });
    if (!live(my)) return;
    let news = [];
    if (n.ok) {
      const sum = Analytics.summarizeNews(n.data.filter(a => !a.seen || Date.now() - Date.parse(a.seen) < 36 * 3600e3));
      news = sum.analyzed.sort((a, b) => b.a.impact - a.a.impact).slice(0, 4);
      ev.push({ w: Math.min(sum.total / 25, 1) * (sum.themes.length ? 1 : 0.5), label: 'Berita', txt: sum.total ? `${sum.total} judul dalam ±24 jam; tema utama: ${sum.themes.slice(0, 3).map(t => t.label.toLowerCase()).join(', ') || '–'}; nada ${sum.sentiment === null ? 'tidak jelas' : sum.sentiment > 0.15 ? 'positif' : sum.sentiment < -0.15 ? 'negatif' : 'campuran'}.` : 'Hampir tidak ada berita 24 jam terakhir: gerakan kemungkinan bukan karena kabar spesifik.', src: n.source, q: 'calculated' });
    } else ev.push({ w: 0, label: 'Berita', txt: 'Berita tidak tersedia: ' + n.error, q: 'unavailable' });
    const rg = MacroPage.regime;
    if (rg && rg.score !== null) ev.push({ w: Math.abs(rg.score) * 0.6, label: 'Rezim pasar', txt: `Rezim ${rg.regime} (keyakinan ${rg.confidence}%): ${rg.evidence.filter(e => e.vote !== 0).map(e => e.why).slice(0, 2).join('; ') || 'tidak ada sinyal kuat'}.`, src: 'FRED (halaman Makro)', q: 'calculated' });
    else ev.push({ w: 0, label: 'Rezim pasar', txt: 'Buka halaman Makro (butuh server) untuk menghitung rezim risk on/off.', q: 'unavailable' });
    ev.sort((a, b) => b.w - a.w);
    /* proksi smart money */
    let smart = null;
    if (i.type === 'stock' && isUS(i) && hasFinnhub()) {
      const ins = await finn('insider', i.sym);
      if (ins.ok) smart = Parsers.insiderSignal(ins.data);
    }
    const vr = vols.length > 21 ? vols[vols.length - 1] / (vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20) : null;
    const pv = Number.isFinite(p) && !simP && vr ? (p > 0 && vr > 1.3 ? 'naik dengan volume tinggi' : p < 0 && vr > 1.3 ? 'turun dengan volume tinggi' : vr < 0.8 ? 'gerak dengan volume tipis' : 'netral') : null;
    let proxy = 'Tidak diketahui';
    const votes = [];
    if (pv === 'naik dengan volume tinggi') votes.push(1); if (pv === 'turun dengan volume tinggi') votes.push(-1);
    if (smart && smart.label === 'Membeli') votes.push(1); if (smart && smart.label === 'Menjual') votes.push(-1);
    if (votes.length) { const s = votes.reduce((a, b) => a + b, 0); proxy = s > 0 ? 'Akumulasi' : s < 0 ? 'Distribusi' : 'Netral'; } else if (pv) proxy = 'Netral';
    if (!live(my)) return;
    el.innerHTML = `<div><h3>Pendorong teratas ${qBadge('calculated')}</h3><ol class="chain">${ev.slice(0, 5).map(e => `<li><b>${esc(e.label)}</b> ${qBadge(e.q)}<br><span style="color:var(--ink-2)">${esc(e.txt)}</span>${e.src ? `<span class="sub" style="display:block;color:var(--ink-3);font-size:10.5px">Sumber: ${esc(e.src)}</span>` : ''}</li>`).join('')}</ol></div>
      ${news.length ? `<div><h3>Judul paling relevan</h3><div class="list">${news.map(a => `<div><a class="item-title" href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a><div class="item-meta"><span>${esc(a.domain)}</span><span>${esc(fmtAge(a.seen))}</span><span>dampak ${a.a.impact}</span></div></div>`).join('')}</div></div>` : ''}
      <div><h3>Proksi smart money ${qBadge('proxy')}</h3><p class="lead"><b>${esc(proxy)}</b>. Bukti: ${pv ? 'harga ' + esc(pv) + (vr ? ` (volume ${fmt(vr, 2)}× rata-rata)` : '') : 'volume tidak tersedia'}${smart ? `; insider 180 hari: ${esc(smart.label)} (${smart.buys} beli, ${smart.sells} jual di pasar)` : i.type === 'stock' ? '; data insider tidak tersedia' : ''}. Kepemilikan institusi (13F), arus ETF, dark pool: tidak tersedia dari sumber gratis yang terpasang.</p></div>
      <p class="disclaimer">"Kenapa bergerak?" menyusun bukti yang tersedia, bukan memastikan penyebab. Proksi smart money hanyalah perkiraan dari data publik, bukan bukti adanya pembeli/penjual besar. Bukan nasihat investasi.</p>`;
  }

  /* ---------------- FUNDAMENTAL ---------------- */
  async function fund(i, el, my) {
    if (!isUS(i) || !hasFinnhub()) { el.innerHTML = needFinnhub(i); return; }
    el.innerHTML = '<p class="loading">Finnhub</p>';
    const [m, pr, rec] = await Promise.all([finn('metric', i.sym), finn('profile', i.sym), finn('recommendation', i.sym)]);
    if (!live(my)) return;
    if (!m.ok) { el.innerHTML = unavailableBox('Fundamental', m); return; }
    const d = m.data;
    const F = [['P/E (TTM)', d.pe, 'x', 'peTTM'], ['P/B', d.pb, 'x', 'pbQuarterly'], ['P/S (TTM)', d.ps, 'x', 'psTTM'], ['EPS (TTM)', d.eps, 'USD', 'epsTTM'], ['ROE (TTM)', d.roe, '%', 'roeTTM'], ['ROA (TTM)', d.roa, '%', 'roaTTM'],
      ['Margin kotor', d.grossMargin, '%', 'grossMarginTTM'], ['Margin operasi', d.opMargin, '%', 'operatingMarginTTM'], ['Margin bersih', d.netMargin, '%', 'netProfitMarginTTM'], ['Utang / ekuitas', d.debtEquity, 'x', 'totalDebt/totalEquityQuarterly'],
      ['Current ratio', d.currentRatio, 'x', 'currentRatioQuarterly'], ['Pertumbuhan pendapatan', d.revGrowth, '% YoY', 'revenueGrowthTTMYoy'], ['Pertumbuhan EPS', d.epsGrowth, '% YoY', 'epsGrowthTTMYoy'], ['Beta', d.beta, '', 'beta'],
      ['Dividend yield', d.divYield, '%', 'dividendYieldIndicatedAnnual'], ['Kapitalisasi pasar', d.mcap, 'juta USD', 'marketCapitalization'], ['Tertinggi 52 minggu', d.hi52, 'USD', '52WeekHigh'], ['Terendah 52 minggu', d.lo52, 'USD', '52WeekLow'], ['FCF per saham', d.fcfShare, 'USD', 'freeCashFlowPerShareTTM']];
    const p = pr.ok ? pr.data : null;
    const r0 = rec.ok && rec.data[0];
    el.innerHTML = `${p ? `<p class="lead">${esc(p.name)} · ${esc(p.industry || '')} · ${esc(p.exchange || '')} · IPO ${esc(p.ipo || '–')}</p>` : ''}
      <dl class="kv three">${F.map(([l, v, u, k]) => `<div><dt>${esc(l)}</dt><dd>${v === null || v === undefined ? '<span class="na">–</span>' : Lineage.wrap({ label: l + ' ' + i.sym, value: fmt(v, Math.abs(v) >= 1000 ? 0 : 2), unit: u, quality: m.stale ? 'stale' : 'delayed', source: 'Finnhub /stock/metric · ' + k, home: 'https://finnhub.io/docs/api/company-basic-financials', url: m.sourceUrl, asOf: 'TTM/kuartal terakhir', fetchedAt: m.fetchedAt, via: m.via, note: 'Dihitung Finnhub dari laporan keuangan; periksa laporan resmi (10-K/10-Q) untuk verifikasi.' }, fmt(v, Math.abs(v) >= 1000 ? 0 : 2))}</dd><small>${esc(u)}</small></div>`).join('')}</dl>
      ${r0 ? `<p class="lead">Rekomendasi analis (${esc(r0.period)}): ${[['beli kuat', r0.strongBuy], ['beli', r0.buy], ['tahan', r0.hold], ['jual', r0.sell], ['jual kuat', r0.strongSell]].map(([k, v]) => k + ' ' + (Number.isFinite(+v) ? String(+v) : '–')).join(', ')}. ${qBadge('delayed')}</p>` : ''}
      <p class="hint">Forward P/E, EBITDA, ROIC, riwayat valuasi, kepemilikan institusi: tidak tersedia di paket gratis Finnhub. ${srcLine(m)}</p>`;
  }
  async function insider(i, el, my) {
    if (!isUS(i) || !hasFinnhub()) { el.innerHTML = needFinnhub(i); return; }
    el.innerHTML = '<p class="loading">Finnhub Form 4</p>';
    const r = await finn('insider', i.sym);
    if (!live(my)) return;
    if (!r.ok) { el.innerHTML = unavailableBox('Transaksi insider', r); return; }
    const sig = Parsers.insiderSignal(r.data);
    const CODE = { P: 'Beli di pasar', S: 'Jual di pasar', A: 'Hibah/penghargaan', M: 'Eksekusi opsi', F: 'Bayar pajak dgn saham', G: 'Hadiah', D: 'Dijual ke emiten', C: 'Konversi' };
    el.innerHTML = `<div class="bigscore"><strong style="font-family:var(--font-ui);font-size:20px">${esc(sig.label)}</strong><span class="meta">180 hari: beli ${sig.buys}× (${fmtCompact(sig.buyValue)} USD), jual ${sig.sells}× (${fmtCompact(sig.sellValue)} USD) ${qBadge('calculated')}${r.stale ? ' ' + qBadge('stale') + ' salinan lama, sumber gagal' : ''}</span></div>
      <div class="table-wrap" style="max-height:260px"><table class="dense static"><thead><tr><th>Orang dalam</th><th>Tanggal</th><th>Jenis</th><th class="num">Perubahan</th><th class="num">Harga</th><th class="num">Kepemilikan</th></tr></thead><tbody>
      ${r.data.slice(0, 60).map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.date || '')}</td><td title="${esc(x.code)}">${esc(CODE[x.code] || x.code)}</td><td class="num ${sign(x.change)}">${fmt(x.change, 0)}</td><td class="num">${x.price ? fmt(x.price, 2) : '–'}</td><td class="num">${fmt(x.shares, 0)}</td></tr>`).join('') || '<tr><td colspan="6">Tidak ada transaksi.</td></tr>'}</tbody></table></div>
      <p class="disclaimer">Sumber: Form 4 SEC via Finnhub (terlambat beberapa hari). Hanya kode P (beli) dan S (jual) di pasar yang dihitung sebagai sinyal; hibah dan eksekusi opsi bukan keputusan beli/jual. Penjualan insider sering karena pajak atau diversifikasi. Tidak menjamin arah harga.</p>${srcLine(r)}`;
  }
  async function earnings(i, el, my) {
    if (!isUS(i) || !hasFinnhub()) { el.innerHTML = needFinnhub(i); return; }
    el.innerHTML = '<p class="loading">Finnhub earnings</p>';
    const r = await finn('earnings', i.sym);
    if (!live(my)) return;
    if (!r.ok) { el.innerHTML = unavailableBox('Earnings', r); return; }
    el.innerHTML = `<table class="dense static"><thead><tr><th>Kuartal</th><th class="num">EPS aktual</th><th class="num">Estimasi</th><th class="num">Kejutan</th><th class="num">%</th></tr></thead><tbody>
      ${r.data.map(e => `<tr><td>${esc(e.period)}</td><td class="num">${fmt(e.actual, 2)}</td><td class="num">${fmt(e.estimate, 2)}</td><td class="num ${sign(e.surprise)}">${fmt(e.surprise, 2)}</td><td class="num ${sign(e.surprisePct)}">${Number.isFinite(e.surprisePct) ? fmt(e.surprisePct, 1) + '%' : '–'}</td></tr>`).join('')}</tbody></table>
      <p class="hint">Riwayat kejutan EPS (4 kuartal, paket gratis). Pendapatan, panduan (guidance), dan tren revisi estimasi: tidak tersedia gratis. ${srcLine(r)}</p>`;
  }
  async function newsTab(i, el, my) {
    el.innerHTML = '<p class="loading">Berita</p>';
    const nm = i.type === 'index' ? i.name : i.name.split(' ').slice(0, 2).join(' ');
    const query = `"${nm.replace(/[^\w\s&.-]/g, '')}" sourcelang:english`;
    const r = isUS(i) && hasFinnhub() ? await finn('news', i.sym) : await getData('gdelt', {
      server: '/api/gdelt/doc?' + new URLSearchParams({ query, mode: 'artlist', timespan: '3d', maxrecords: '50', sort: 'DateDesc' }),
      direct: 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({ query, mode: 'artlist', format: 'json', timespan: '3d', maxrecords: '50', sort: 'DateDesc' }),
      parse: Parsers.parseGdeltArticles, ttl: 20 * 60e3, persist: true, key: 'gdn3:' + i.sym, alive: () => live(my),
    });
    if (!live(my)) return;
    if (!r.ok) { el.innerHTML = unavailableBox('Berita ' + i.name, r); return; }
    const sum = Analytics.summarizeNews(r.data);
    el.innerHTML = `<div class="list">${sum.analyzed.slice(0, 30).map(a => `<div><a class="item-title" href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a><div class="item-meta"><span>${esc(a.domain)}</span><span>${esc(fmtAge(a.seen))}</span>${a.a.themes[0] ? `<span class="tpill">${esc(a.a.themes[0].label)}</span>` : ''}${a.a.speculative ? '<span class="tpill spec">spekulatif</span>' : ''}</div></div>`).join('') || '<p class="hint">Tidak ada berita.</p>'}</div>${srcLine(r)}`;
  }
  /* order book kripto: data nyata Binance, dihitung spread dan ketidakseimbangan */
  async function book(i, el, my) {
    el.innerHTML = '<p class="loading">Binance order book</p>';
    let r = await getData('binance', { server: `/api/crypto/depth?symbol=${i.bn}`, direct: `https://api.binance.com/api/v3/depth?symbol=${i.bn}&limit=100`, parse: Parsers.parseBinanceDepth, ttl: 2000, key: 'depth:' + i.bn });
    /* tanpa server dan api.binance.com diblokir: cermin resmi data-api.binance.vision */
    if ((!r.ok || r.stale) && !Net.server && live(my)) {
      const m = await getData('binance', { direct: `https://data-api.binance.vision/api/v3/depth?symbol=${i.bn}&limit=100`, parse: Parsers.parseBinanceDepth, ttl: 2000, key: 'depthv:' + i.bn });
      if (m.ok) r = m;
    }
    if (!live(my)) return;
    if (!r.ok) { el.innerHTML = unavailableBox('Order book ' + i.sym, r, 'Tidak disimulasikan: kalau Binance tidak bisa diakses, panel ini kosong.'); return; }
    const { bids, asks } = r.data;
    if (!bids.length || !asks.length) { el.innerHTML = '<p class="hint">Order book kosong.</p>'; return; }
    const bid = bids[0][0], ask = asks[0][0], mid = (bid + ask) / 2, spread = ask - bid;
    const depth = (arr, pctBand) => arr.filter(([p]) => Math.abs(p / mid - 1) <= pctBand).reduce((a, [p, q]) => a + p * q, 0);
    const b1 = depth(bids, 0.01), a1 = depth(asks, 0.01), imb = (b1 - a1) / (b1 + a1 || 1);
    const top = 12, maxQ = Math.max(...bids.slice(0, top).map(x => x[1]), ...asks.slice(0, top).map(x => x[1]));
    const row = ([p, q], side) => `<tr><td class="num ${side}">${fmt(p, i.dp)}</td><td class="num">${fmt(q, 4)}</td><td style="width:45%"><div class="meter"><i style="width:${q / maxQ * 100}%;background:var(--${side})"></i></div></td></tr>`;
    el.innerHTML = `<dl class="kv three"><div><dt>Bid</dt><dd class="up">${fmt(bid, i.dp)}</dd></div><div><dt>Ask</dt><dd class="down">${fmt(ask, i.dp)}</dd></div><div><dt>Spread</dt><dd>${fmt(spread / mid * 1e4, 2)} <small>bps</small></dd></div>
      <div><dt>Kedalaman bid ±1%</dt><dd>${fmtCompact(b1)} <small>USDT</small></dd></div><div><dt>Kedalaman ask ±1%</dt><dd>${fmtCompact(a1)} <small>USDT</small></dd></div><div><dt>Ketidakseimbangan</dt><dd class="${sign(imb)}">${fmtPct(imb, 1)}</dd></div></dl>
      <div class="c-cols"><table class="dense static"><thead><tr><th class="num">Bid</th><th class="num">Jumlah</th><th></th></tr></thead><tbody>${bids.slice(0, top).map(x => row(x, 'up')).join('')}</tbody></table>
      <table class="dense static"><thead><tr><th class="num">Ask</th><th class="num">Jumlah</th><th></th></tr></thead><tbody>${asks.slice(0, top).map(x => row(x, 'down')).join('')}</tbody></table></div>
      <p class="hint">${qBadge(r.stale ? 'stale' : 'live')} Snapshot 100 level Binance ${esc(i.bn)}${r.stale ? ' (SALINAN LAMA, sumber gagal)' : ''}. Spread dan ketidakseimbangan = ${qBadge('calculated')}. Open interest, funding, likuidasi (derivatif) dan metrik on-chain belum dipasang. ${srcLine(r)}</p>`;
  }

  async function render(i, el, flag) {
    cur = i;
    const my = ++seq;
    await Net.ready();
    if (!live(my)) return;
    const tabs = tabsFor(i);
    if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
    flag.hidden = !(tab === 'health');
    flag.textContent = 'Data simulasi';
    const head = `<div class="tabs" role="tablist" style="padding:0;margin:-4px 0 4px">${tabs.map(([k, l]) => `<button type="button" role="tab" data-at="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>`;
    el.innerHTML = head + '<div id="assetTabBody" style="display:grid;gap:10px"></div>';
    const body = $('#assetTabBody');
    if (tab === 'why') return why(i, body, my);
    if (tab === 'fund') return fund(i, body, my);
    if (tab === 'insider') return insider(i, body, my);
    if (tab === 'earnings') return earnings(i, body, my);
    if (tab === 'news') return newsTab(i, body, my);
    if (tab === 'book') return book(i, body, my);
    if (tab === 'index' || tab === 'health') return App.legacyHealth(i, body);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-at]'); if (!b || !cur) return;
    tab = b.dataset.at; Store.set('assetTab', tab);
    render(cur, $('#healthBody'), $('#hFlag'));
  });
  bus.on('companyTab', t => { tab = t; Store.set('assetTab', t); if (cur) render(cur, $('#healthBody'), $('#hFlag')); });
  /* dipakai halaman detail aset: render satu bagian ke elemen lain dengan token sendiri */
  const PARTS = { fund: (i, el, a) => fund(i, el, a), insider: (i, el, a) => insider(i, el, a), earnings: (i, el, a) => earnings(i, el, a), book: (i, el, a) => book(i, el, a), why: (i, el, a) => why(i, el, a) };
  function renderPart(part, i, el, alive) { const f = PARTS[part]; return f ? f(i, el, alive) : null; }
  return { render, renderPart, isUS, get current() { return cur; } };
})();
