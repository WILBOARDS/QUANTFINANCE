/* =====================================================================
   DETAIL ASET TERPADU (perintah: AAPL Q / GP / DES / FA / NEWS ...)
   - Kepala: kode, nama, jenis, negara/bursa, mata uang, harga + metadata data
     {nilai, asOf, fetchedAt, sumber, kualitas, basi, mata uang} dan umur data.
   - Tab dari registri SecurityTabs: modul lain menambah tab tanpa mengubah file ini.
   - Mode bandingkan: tabel kuotasi + grafik kinerja dinormalisasi (=100 di awal periode).
   ===================================================================== */
const SecurityTabs = (() => {
  const tabs = [];
  return {
    /* t: { id, label, verb, types:[...], order, render: async (entity, el, ctx) } ; ctx = { alive(), quote, open(tab) } */
    register(t) { const i = tabs.findIndex(x => x.id === t.id); if (i >= 0) tabs[i] = t; else tabs.push(t); tabs.sort((a, b) => (a.order ?? 50) - (b.order ?? 50)); },
    for: e => tabs.filter(t => t.types.includes(e.type)),
    get: id => tabs.find(t => t.id === id) || null,
    all: () => tabs.slice(),
  };
})();
/* adaptor entitas -> bentuk instrumen yang dipakai renderer lama (AssetPanel) */
function instLike(e) {
  const i = BY[e.symbol];
  if (i && (i.type === e.type || (e.type === 'etf' && i.type === 'stock'))) return i;
  return { sym: (e.providers && e.providers.finnhub) || e.symbol, name: e.name, type: e.type === 'etf' ? 'etf' : e.type, mkt: e.country === 'US' ? 'US' : e.country, finnhub: e.providers && e.providers.finnhub, bn: e.providers && e.providers.binance, cur: e.currency, dp: 2, price: NaN, prev: NaN, real: false };
}

const SecurityPage = (() => {
  const S = { e: null, tab: 'overview', seq: 0, quote: null, cmp: null, chart: null, qTimer: null };
  let built = false;
  const typeLbl = t => REG.types[t] || t;

  function head() {
    const e = S.e, q = S.quote;
    const country = e.country && C2.get(e.country);
    $('#secSym').textContent = e.symbol || e.name;
    $('#secName').textContent = e.name;
    $('#secMeta').innerHTML = [typeLbl(e.type), e.exchange && e.exchange !== e.country ? 'bursa ' + e.exchange : '', country ? country.name : '', e.currency ? 'mata uang ' + e.currency : '', e.unit ? 'satuan ' + e.unit : '', e.sector || '']
      .filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
    const pq = $('#secQuote');
    if (!q) { pq.innerHTML = '<span class="loading">Mengambil harga</span>'; return; }
    const p = q.price;
    const dp = priceDp(e, p.value);
    const unit = e.type === 'rate' ? '%' : (p.currency || e.currency || '');
    pq.innerHTML = p.value === null
      ? `<div class="sq-main"><span class="na big">Tidak tersedia</span>${qBadge('unavailable')}</div><p class="hint">${esc(q.reason || p.reason || '')}</p>`
      : `<div class="sq-main"><span class="sq-price num">${datumHtml(p, { dp, label: (e.symbol || e.name) + ' harga' })}</span><span class="meta">${esc(unit)}</span>
          ${q.changePct && q.changePct.value !== null ? `<span class="pill ${sign(q.changePct.value)}">${datumHtml(q.changePct, { dp: 2, label: 'Perubahan %' })}%</span>` : ''}
          ${q.changeBp && q.changeBp.value !== null ? `<span class="pill ${sign(q.changeBp.value)}">${datumHtml(q.changeBp, { dp: 0, label: 'Perubahan bp' })} bp</span>` : ''}
          ${datumAge(p)}</div>
        <dl class="sq-meta">${[['Sumber', esc(p.source || '–')], ['Waktu data', esc(p.asOf ? fmtTime(p.asOf) : '–')], ['Diambil', esc(p.fetchedAt ? fmtTime(p.fetchedAt) + ' (' + fmtAge(p.fetchedAt) + ')' : '–')], ['Kualitas', esc((QUALITY[p.quality] || [p.quality])[0]) + (p.stale ? ' (basi)' : '')],
          ['Penutupan sebelumnya', q.prev && q.prev.value !== null ? esc(fmt(q.prev.value, dp)) + (q.prevDate ? ' <small>' + esc(q.prevDate) + '</small>' : '') : '–'],
          ...(q.high && q.high.value !== null ? [['Tertinggi', esc(fmt(q.high.value, dp))], ['Terendah', esc(fmt(q.low.value, dp))]] : [])]
          .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${q.note ? `<p class="hint">${esc(q.note)}</p>` : ''}`;
    $('#secWatch').textContent = Watchlists.has(Watchlists.active().id, e.id) ? 'Hapus dari watchlist' : 'Tambah ke watchlist';
  }
  async function loadQuote() {
    const my = S.seq, e = S.e;
    const q = await Quotes.get(e);
    if (my !== S.seq || e !== S.e) return;
    S.quote = q; head();
  }
  function tabBar() {
    const tabs = SecurityTabs.for(S.e);
    if (!tabs.some(t => t.id === S.tab)) S.tab = tabs.length ? tabs[0].id : 'overview';
    $('#secTabs').innerHTML = tabs.map(t => `<button type="button" role="tab" data-st="${t.id}" aria-selected="${t.id === S.tab}" title="Perintah: ${esc((S.e.symbol || '') + ' ' + (t.verb || ''))}">${esc(t.label)}${t.verb ? ` <kbd>${esc(t.verb)}</kbd>` : ''}</button>`).join('');
  }
  async function body() {
    const my = ++S.seq;
    const el = $('#secBody');
    const t = SecurityTabs.get(S.tab);
    if (!t) { el.innerHTML = unavailableBox('Tab tidak ada', { error: S.tab }); return; }
    if (S.tab !== 'chart' && S.chart) { S.chart.destroy(); S.chart = null; }
    el.innerHTML = '<p class="loading">Memuat</p>';
    const ctx = { alive: () => my === S.seq && $('#page-security') && !$('#page-security').hidden, get quote() { return S.quote; }, open: tab => { S.tab = tab; tabBar(); body(); } };
    try { await t.render(S.e, el, ctx); }
    catch (err) {
      ErrorLog.report('render', `Tab ${t.label} ${S.e.symbol}: ${err.message}`, err.stack);
      if (my === S.seq) el.innerHTML = unavailableBox(t.label, { error: 'Gagal ditampilkan: ' + err.message });
    }
    /* tidak boleh ada indikator "memuat" yang tertinggal tanpa isi */
    if (my === S.seq && el.querySelector(':scope > .loading:only-child')) el.innerHTML = unavailableBox(t.label, { error: 'Tidak ada data.' });
  }
  function renderAll() {
    $('#secCompare').hidden = true; $('#secMain').hidden = false;
    S.quote = null; S.seq++;
    head(); tabBar(); body(); loadQuote();
    clearInterval(S.qTimer);
    S.qTimer = setInterval(() => { if (!$('#page-security').hidden && !document.hidden) loadQuote(); }, 15000);
  }

  /* ---------- bandingkan ---------- */
  async function renderCompare() {
    $('#secMain').hidden = true; $('#secCompare').hidden = false;
    const my = ++S.seq, list = S.cmp;
    const tf = Store.get('cmpTf', '1Y');
    const el = $('#secCompare');
    el.innerHTML = `<div class="card-head"><h2>Bandingkan ${list.map(e => esc(e.symbol)).join(' · ')}</h2><div class="seg" role="group" aria-label="Rentang">${['1M', '3M', '6M', 'YTD', '1Y', '5Y'].map(t => `<button type="button" data-ctf="${t}" aria-pressed="${t === tf}">${t}</button>`).join('')}</div></div>
      <div class="side-body"><div id="cmpTable"><p class="loading">Mengambil harga</p></div><h3>Kinerja dinormalisasi (awal periode = 100) ${qBadge('calculated', 'Dihitung dari riwayat masing-masing sumber')}</h3><div id="cmpChart"><p class="loading">Mengambil riwayat</p></div></div>`;
    const quotes = await Promise.all(list.map(e => Quotes.get(e)));
    if (my !== S.seq) return;
    $('#cmpTable').innerHTML = `<table class="dense"><thead><tr><th>Kode</th><th>Nama</th><th class="num">Harga</th><th class="num">Perubahan</th><th>Kualitas · umur</th><th>Sumber</th></tr></thead><tbody>${list.map((e, k) => { const q = quotes[k]; return `<tr><td><button type="button" class="link-btn" data-open="${esc(e.id)}">${esc(e.symbol)}</button></td><td>${esc(e.name)}</td><td class="num">${datumHtml(q.price, { dp: priceDp(e, q.price.value) })}</td><td class="num">${q.changePct && q.changePct.value !== null ? `<span class="${sign(q.changePct.value)}">${datumHtml(q.changePct, { dp: 2 })}%</span>` : '<span class="na">–</span>'}</td><td>${datumAge(q.price)}</td><td class="src">${esc(q.price.source || q.reason || '')}</td></tr>`; }).join('')}</tbody></table>`;
    const hs = await Promise.all(list.map(e => Quotes.history(e, tf)));
    if (my !== S.seq) return;
    const series = list.map((e, k) => ({ e, h: hs[k], pts: (hs[k].bars || []).filter(b => Number.isFinite(b.close) && b.close > 0) }));
    const ok = series.filter(s => s.pts.length >= 2);
    const missing = series.filter(s => s.pts.length < 2);
    if (!ok.length) { $('#cmpChart').innerHTML = unavailableBox('Grafik perbandingan', { error: 'Tidak ada riwayat untuk aset yang dipilih.' }); return; }
    /* normalisasi: hari pertama yang dimiliki SEMUA seri = 100 (supaya titik awal sama) */
    const day = t => Math.floor(t / 86400);
    const start = Math.max(...ok.map(s => day(s.pts[0].time)));
    const cols = ['#e0b15a', '#6fb1ff', '#34d1a4', '#ff9f6b', '#c792ea', '#ff6f61'];
    const Wd = 760, Ht = 240, lines = [];
    let lo = Infinity, hi = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const s of ok) {
      const pts = s.pts.filter(p => day(p.time) >= start);
      if (pts.length < 2) continue;
      const base = pts[0].close;
      const norm = pts.map(p => ({ t: p.time, v: p.close / base * 100 }));
      norm.forEach(p => { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); t0 = Math.min(t0, p.t); t1 = Math.max(t1, p.t); });
      lines.push({ s, norm, last: norm[norm.length - 1].v });
    }
    if (!lines.length) { $('#cmpChart').innerHTML = unavailableBox('Grafik perbandingan', { error: 'Periode riwayat tidak beririsan.' }); return; }
    const X = t => 40 + (Wd - 50) * (t - t0) / Math.max(1, t1 - t0), Y = v => 10 + (Ht - 30) * (1 - (v - lo) / Math.max(1e-9, hi - lo));
    $('#cmpChart').innerHTML = `<div class="svgchart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Kinerja dinormalisasi"><line x1="40" x2="${Wd - 10}" y1="${Y(100)}" y2="${Y(100)}" stroke="#2a4a68" stroke-dasharray="3 3"/>
      <text x="4" y="${Y(100) + 4}" fill="#93a8bf" font-size="10">100</text><text x="4" y="${Y(hi) + 4}" fill="#93a8bf" font-size="10">${fmt(hi, 0)}</text><text x="4" y="${Y(lo) + 4}" fill="#93a8bf" font-size="10">${fmt(lo, 0)}</text>
      ${lines.map((l, k) => `<path d="${l.norm.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ')}" fill="none" stroke="${cols[k % cols.length]}" stroke-width="1.6"/>`).join('')}</svg>
      <div class="lg">${lines.map((l, k) => `<span><i style="background:${cols[k % cols.length]}"></i>${esc(l.s.e.symbol)} ${fmt(l.last - 100, 1)}% · ${qBadge(l.s.h.quality, l.s.h.source)}</span>`).join('')}<span>mulai ${esc(new Date(t0 * 1000).toISOString().slice(0, 10))}</span></div></div>
      <p class="hint">Rumus: harga ÷ harga pada tanggal awal bersama × 100. Sumber tiap seri berbeda (lihat lencana); zona waktu penutupan bisa berbeda antar bursa.${missing.length ? ' Tanpa riwayat: ' + esc(missing.map(m => m.e.symbol + ' (' + (m.h.error || 'tidak ada') + ')').join('; ')) : ''}</p>`;
  }

  function build() {
    if (built) return; built = true;
    $('#secTabs').addEventListener('click', ev => { const b = ev.target.closest('[data-st]'); if (!b) return; S.tab = b.dataset.st; Store.set('secTab', S.tab); tabBar(); body(); });
    $('#secWatch').addEventListener('click', () => { const wl = Watchlists.active(); if (Watchlists.has(wl.id, S.e.id)) Watchlists.removeItem(wl.id, S.e.id); else Watchlists.add(wl.id, S.e.id); head(); });
    $('#secAlert').addEventListener('click', () => { App.showPage('alerts'); $('#alSym').value = S.e.symbol; $('#alVal').focus(); });
    $('#secCmp').addEventListener('click', () => CommandBar.fill((S.e.symbol || '') + ' COMPARE '));
    $('#secRefresh').addEventListener('click', () => { S.quote = null; head(); loadQuote(); body(); });
    $('#secCompare').addEventListener('click', ev => {
      const t = ev.target.closest('[data-ctf]'); if (t) { Store.set('cmpTf', t.dataset.ctf); renderCompare(); return; }
      const o = ev.target.closest('[data-open]'); if (o) { open(REG.get(o.dataset.open), 'overview'); renderAll(); }
    });
  }
  function open(e, tab) { if (!e) return; S.e = e; S.cmp = null; S.tab = tab || S.tab || 'overview'; Store.set('secEntity', e.id); }
  return {
    open,
    compare(list) { S.cmp = list.slice(0, Commands.MAX_COMPARE); S.e = list[0]; },
    show() {
      build();
      if (!S.e) S.e = REG.get(Store.get('secEntity', '')) || REG.get('stock:AAPL');
      if (S.cmp && S.cmp.length > 1) renderCompare(); else renderAll();
    },
    hide() { clearInterval(S.qTimer); S.seq++; if (S.chart) { S.chart.destroy(); S.chart = null; } },
    get state() { return { entity: S.e && S.e.id, tab: S.tab, compare: S.cmp ? S.cmp.map(e => e.id) : null, quote: S.quote && { value: S.quote.price.value, quality: S.quote.price.quality, source: S.quote.price.source } }; },
    set chart(c) { S.chart = c; }, get chart() { return S.chart; },
  };
})();

/* ---------------- tab bawaan ---------------- */
const PRICED_T = ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity', 'rate'];
SecurityTabs.register({
  id: 'overview', label: 'Ringkasan', verb: 'Q', types: [...PRICED_T, 'company'], order: 0,
  async render(e, el, ctx) {
    const P = e.providers || {};
    const src = [P.finnhub && 'Finnhub (' + P.finnhub + ')', P.binance && 'Binance (' + P.binance + ')', P.coingecko && 'CoinGecko (' + P.coingecko + ')', P.fred && 'FRED (' + P.fred + ')', P.fx && 'ExchangeRate-API / Frankfurter', P.yahoo && 'Yahoo tidak resmi (' + P.yahoo + ')', P.bis && 'BIS'].filter(Boolean);
    const inW = Watchlists.lists().filter(l => l.items.includes(e.id)).map(l => l.name);
    const al = Alerts.list().filter(a => a.entityId === e.id);
    el.innerHTML = `<div class="c-cols"><div class="c-sec"><h3>Data referensi</h3><dl class="kv">
        ${[['Kode', e.symbol], ['Nama', e.name], ['Jenis', REG.types[e.type]], ['Negara', e.country && C2.get(e.country) ? C2.get(e.country).name : (e.country || '–')], ['Mata uang', e.currency || '–'], ['Satuan', e.unit || '–'], ['Sektor / fokus', e.sector || '–'], ['Alias pencarian', (e.aliases || []).slice(0, 6).join(', ') || '–']]
          .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v || '–')}</dd></div>`).join('')}</dl>
        <p class="hint">Data referensi dari katalog aplikasi (kode dan pemetaan sumber), bukan data pasar.${e.note ? ' ' + esc(e.note) : ''}</p></div>
      <div class="c-sec"><h3>Sumber yang dicoba untuk aset ini</h3><ol class="chain">${src.map(s => `<li>${esc(s)}</li>`).join('') || '<li>Tidak ada sumber harga.</li>'}</ol>
        <p class="hint">Urutan: sumber resmi/berkunci dulu, lalu cadangan. Yang gagal ditandai "Tidak tersedia"; tidak pernah diganti angka simulasi.</p>
        <h3>Di watchlist</h3><p>${inW.length ? esc(inW.join(', ')) : '<span class="na">belum</span>'}</p>
        <h3>Alert</h3><p>${al.length ? al.map(a => esc(a.text) + (a.triggeredAt ? ' (terpicu)' : a.enabled ? ' (aktif)' : ' (dijeda)')).join('<br>') : '<span class="na">belum ada</span>'}</p></div></div>
      <div class="c-sec"><h3>Grafik singkat 1Y</h3><div id="ovChart"><p class="loading">Mengambil riwayat</p></div></div>`;
    const h = await Quotes.history(e, '1Y');
    if (!ctx.alive()) return;
    const box = el.querySelector('#ovChart'); if (!box) return;
    const pts = (h.bars || []).filter(b => Number.isFinite(b.close));
    if (pts.length < 2) { box.innerHTML = unavailableBox('Riwayat 1 tahun', { error: h.error || 'tidak ada riwayat' }); return; }
    const Wd = 620, Ht = 120, ys = pts.map(p => p.close), lo = Math.min(...ys), hi = Math.max(...ys);
    const X = i => 4 + (Wd - 8) * i / (pts.length - 1), Y = v => 6 + (Ht - 12) * (1 - (v - lo) / Math.max(1e-12, hi - lo));
    const chg = ys[ys.length - 1] / ys[0] - 1;
    box.innerHTML = `<div class="svgchart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Harga 1 tahun"><path d="${pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.close).toFixed(1)).join(' ')}" fill="none" stroke="${chg >= 0 ? '#34d1a4' : '#ff6f61'}" stroke-width="1.5"/></svg>
      <div class="lg"><span>${esc(new Date(pts[0].time * 1000).toISOString().slice(0, 10))} → ${esc(new Date(pts[pts.length - 1].time * 1000).toISOString().slice(0, 10))}</span><span class="${sign(chg)}">${fmtPct(chg, 1)} ${qBadge('calculated', 'perubahan dari bar pertama ke terakhir')}</span><span>rendah ${fmt(lo, 2)} · tinggi ${fmt(hi, 2)}</span>${qBadge(h.quality, h.source)}<span class="meta">${esc(h.source || '')}</span></div></div>`;
  },
});
SecurityTabs.register({
  id: 'chart', label: 'Grafik', verb: 'GP', types: PRICED_T, order: 10,
  async render(e, el, ctx) {
    el.innerHTML = '<div class="pc-wrap" id="secChart"></div>';
    if (SecurityPage.chart) SecurityPage.chart.destroy();
    const c = ProChart.create(el.querySelector('#secChart'));
    SecurityPage.chart = c;
    c.set(e);
  },
});
SecurityTabs.register({
  id: 'news', label: 'Berita', verb: 'NEWS', types: [...PRICED_T, 'company'], order: 60,
  async render(e, el, ctx) {
    const i = instLike(e);
    const useFinnhub = AssetPanel.isUS(i) && Net.server && Net.server.health.keys && Net.server.health.keys.finnhub;
    const nm = e.type === 'fx' ? (e.aliases || [])[1] || e.name : e.type === 'rate' ? 'Treasury yields' : e.name.replace(/\b(Inc\.?|Corporation|Corp\.?|Tbk|plc|S\.A\.|N\.V\.|SE|Ltd\.?|Holdings?|Group|Company|Co\.)\b|\(.*?\)|,/gi, '').trim();
    const query = `"${nm.replace(/[^\w\s&.-]/g, '').trim()}" sourcelang:english`;
    const r = useFinnhub
      ? await getData('finnhub', { server: `/api/finnhub?kind=news&symbol=${encodeURIComponent(i.sym)}`, ttl: 15 * 60e3, key: 'fh:news:' + i.sym })
      : await getData('gdelt', {
        server: '/api/gdelt/doc?' + new URLSearchParams({ query, mode: 'artlist', timespan: '3d', maxrecords: '50', sort: 'DateDesc' }),
        direct: 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({ query, mode: 'artlist', format: 'json', timespan: '3d', maxrecords: '50', sort: 'DateDesc' }),
        parse: Parsers.parseGdeltArticles, ttl: 20 * 60e3, persist: true, key: 'secn:' + e.id, timeout: 35000, alive: ctx.alive,
      });
    if (!ctx.alive()) return;
    if (!r.ok) { el.innerHTML = unavailableBox('Berita ' + (e.symbol || e.name), r); return; }
    const now = Date.now();
    const items = (r.data || []).map(n => ({ ...n, seen: n.seen || n.datetime, a: Analytics.analyzeHeadline(n.title || n.headline || '', n.seen || n.datetime, now) }));
    el.innerHTML = `<p class="hint">Kueri: <code>${esc(useFinnhub ? 'Finnhub company-news ' + i.sym : query)}</code>. Tema, nada, dan skor dampak = ${qBadge('inference', 'Analisis otomatis berbasis kata kunci')} analisis otomatis, bukan fakta.</p>
      <div class="list">${items.slice(0, 40).map(n => `<div><a class="item-title" href="${safeUrl(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title || n.headline || '')}</a><div class="item-meta"><span>${esc(n.domain || n.source || '')}</span><span>${esc(fmtAge(n.seen))}</span>${n.a.themes[0] ? `<span class="tpill">${esc(n.a.themes[0].label)}</span>` : ''}${n.a.speculative ? '<span class="tpill spec">spekulatif</span>' : ''}<span title="Analisis otomatis">nada: ${esc(n.a.sentiment.label)}</span></div></div>`).join('') || '<p class="hint">Tidak ada berita dalam 3 hari terakhir.</p>'}</div>${srcLine(r)}`;
  },
});
SecurityTabs.register({
  id: 'des', label: 'Profil', verb: 'DES', types: ['stock', 'etf', 'index', 'crypto', 'company'], order: 5,
  async render(e, el, ctx) {
    const i = instLike(e);
    const parts = [];
    if (AssetPanel.isUS(i) && Net.server && Net.server.health.keys && Net.server.health.keys.finnhub) {
      const r = await getData('finnhub', { server: `/api/finnhub?kind=profile&symbol=${encodeURIComponent(i.sym)}`, ttl: 12 * 3600e3, persist: true, key: 'fh:profile:' + i.sym });
      if (!ctx.alive()) return;
      if (r.ok && r.data) {
        const p = r.data;
        parts.push(`<div class="c-sec"><h3>Profil perusahaan ${qBadge(r.stale ? 'stale' : 'delayed')}</h3><dl class="kv">${[['Nama', p.name], ['Bursa', p.exchange], ['Industri', p.industry], ['Negara', p.country], ['IPO', p.ipo], ['Mata uang', p.currency], ['Situs', p.weburl ? `<a href="${safeUrl(p.weburl)}" target="_blank" rel="noopener noreferrer">${esc(p.weburl)}</a>` : null]]
          .map(([k, v]) => `<div><dt>${k}</dt><dd>${v ? (k === 'Situs' ? v : esc(v)) : '<span class="na">–</span>'}</dd></div>`).join('')}</dl>${srcLine(r, 'Finnhub /stock/profile2')}</div>`);
      } else parts.push(unavailableBox('Profil Finnhub', r));
    }
    const title = e.type === 'crypto' ? e.name + ' (cryptocurrency)' : e.type === 'index' ? e.name : e.name.replace(/\s*\(.*?\)\s*/g, '');
    const w = await getData('wikipedia', { server: '/api/wiki/summary?title=' + encodeURIComponent(title), direct: 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')), parse: Parsers.parseWikiSummary, ttl: 24 * 3600e3, persist: true, key: 'wk:' + title });
    if (!ctx.alive()) return;
    parts.push(w.ok && w.data && w.data.extract
      ? `<div class="c-sec"><h3>Ringkasan ensiklopedia ${qBadge('historical')}</h3><p style="color:var(--ink-2);text-wrap:pretty">${esc(w.data.extract)}</p><p class="src-line">Sumber: <a href="${safeUrl(w.data.url)}" target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA) · revisi ${esc(w.data.updated ? fmtDate(w.data.updated) : '–')}. Bisa tidak persis cocok dengan entitas ini; periksa tautannya.</p></div>`
      : unavailableBox('Ringkasan Wikipedia', w));
    el.innerHTML = parts.join('');
  },
});
/* bagian lama (Finnhub & Binance) dipakai ulang lewat AssetPanel.renderPart */
const legacyTab = (id, label, verb, types, part, order) => SecurityTabs.register({
  id, label, verb, types, order,
  async render(e, el, ctx) {
    /* "Kenapa bergerak?" butuh harga live dari daftar Pasar (pembanding indeks, volume, sparkline) */
    if (part === 'why' && !BY[e.symbol]) { el.innerHTML = unavailableBox(label, { error: 'Analisis ini baru tersedia untuk aset di daftar halaman Pasar.' }); return; }
    el.innerHTML = '<div style="display:grid;gap:10px"></div>';
    await AssetPanel.renderPart(part, instLike(e), el.firstElementChild, ctx.alive);
  },
});
legacyTab('fa', 'Fundamental', 'FA', ['stock'], 'fund', 20);
legacyTab('insider', 'Insider', 'INSIDER', ['stock'], 'insider', 40);
legacyTab('est', 'Earnings', 'EST', ['stock'], 'earnings', 35);
legacyTab('depth', 'Order book', 'DEPTH', ['crypto'], 'book', 25);
legacyTab('why', 'Kenapa bergerak?', '', ['stock', 'crypto', 'index'], 'why', 8);
App.registerPage('security', SecurityPage);
