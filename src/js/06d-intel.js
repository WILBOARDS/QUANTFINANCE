/* =====================================================================
   HALAMAN INTEL 3D: globe utama dengan semua lapisan + panel detail
   Klik negara -> intelijen negara. Klik kapal -> info kapal.
   Klik peristiwa -> detail + sumber. Klik bursa -> panel pasar.
   ===================================================================== */
const HazardData = (() => {
  let p = null, t = 0;
  async function load() {
    if (p && Date.now() - t < 5 * 60e3) return p;
    t = Date.now();
    p = (async () => {
      await Net.ready();
      if (Net.server) {
        const r = await getData('usgs', { server: '/api/hazards', ttl: 5 * 60e3, key: 'hz' });
        if (r.ok) {
          let u = r.data.usgs;
          const g = r.data.gdacs;
          /* USGS gagal di server: coba langsung dari browser (USGS mengizinkan CORS) */
          if (!(u && u.ok)) {
            const ud = await getData('usgs', { direct: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', parse: Parsers.parseUsgs, ttl: 5 * 60e3, key: 'usgs' });
            u = ud.ok ? { ok: true, data: ud.data, via: 'langsung' } : { ok: false, error: (u && u.error || 'gagal') + ' | langsung: ' + ud.error };
          }
          const items = [...(u && u.ok ? u.data : []), ...(g && g.ok ? g.data : [])];
          return { ...r, items, parts: { usgs: u, gdacs: g } };
        }
        if (r.cancelled) return r;
        const ud = await getData('usgs', { direct: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', parse: Parsers.parseUsgs, ttl: 5 * 60e3, key: 'usgs' });
        if (ud.ok) return { ...ud, items: ud.data, parts: { usgs: ud, gdacs: { ok: false, error: r.error } } };
        return r;
      }
      const u = await getData('usgs', { direct: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', parse: Parsers.parseUsgs, ttl: 5 * 60e3, key: 'usgs' });
      return { ...u, items: u.ok ? u.data : [], parts: { usgs: u, gdacs: { ok: false, error: 'GDACS butuh server lokal' } } };
    })();
    return p;
  }
  return { load };
})();
const NewsGeo = (() => {
  let p = null;
  const QUERY = '(economy OR inflation OR protest OR sanctions OR military OR election OR oil OR tariff OR attack OR strike)';
  function load() {
    if (!p) p = getData('gdelt', {
      server: '/api/gdelt/geo?' + new URLSearchParams({ query: QUERY, timespan: '24h' }),
      direct: 'https://api.gdeltproject.org/api/v2/geo/geo?' + new URLSearchParams({ query: QUERY, mode: 'PointData', format: 'GeoJSON', timespan: '24h' }),
      parse: Parsers.parseGdeltGeo, ttl: 30 * 60e3, persist: true, key: 'gdgeo', timeout: 40000,
    }).then(r => { if (!r.ok) p = null; return r; });
    return p;
  }
  return { load, QUERY };
})();

function marketPoints() {
  return Object.values(MARKETS).map(m => {
    const inst = BY[m.idx];
    return { id: m.id, lon: m.lon, lat: m.lat, label: m.idx, city: m.city, ex: m.ex, open: statusOf(m.id).open, chg: pct(inst), price: inst.price, quality: inst.quality };
  });
}

const IntelPage = (() => {
  const S = { globe: null, metric: Store.get('intelMetric', 'growth'), feed: 'hazards', sel: null, hz: null, news: null, choke: null, shipTimer: null };
  const layerStatus = {};
  let built = false;
  const LAYERS = [
    ['choropleth', 'Ekonomi'], ['markets', 'Pasar'], ['news', 'Berita'], ['hazards', 'Bencana'],
    ['ships', 'Kapal'], ['chokepoints', 'Chokepoint'], ['night', 'Malam'], ['boxes', 'Kotak AIS'],
  ];
  const vis = Object.assign({ choropleth: true, markets: true, news: false, hazards: true, ships: true, chokepoints: true, night: true, boxes: false }, Store.get('intelLayers', {}));

  function setStatus(k, s, title) {
    layerStatus[k] = s;
    const b = $(`#layerChips [data-l="${k}"] .st`);
    if (b) { b.dataset.s = s; b.parentElement.title = title || ''; }
  }
  function chips() {
    $('#layerChips').innerHTML = LAYERS.map(([k, l]) => `<button type="button" data-l="${k}" aria-pressed="${!!vis[k]}"><i class="st" data-s="${layerStatus[k] || 'idle'}"></i>${l}</button>`).join('');
  }
  function metricOptions() {
    const opts = [...MACRO.map(m => [m.key, m.label + ' (' + m.unit + ')']), ['score', 'Skor negara (eksperimental)'], ['polstab', 'Stabilitas politik WGI'], ['reservesMonths', 'Cadangan devisa (bulan impor)']];
    $('#econMetric').innerHTML = opts.map(([k, l]) => `<option value="${k}" ${k === S.metric ? 'selected' : ''}>${esc(l)}</option>`).join('');
  }
  function choropleth() {
    const k = S.metric;
    const values = new Map();
    let ind = MACRO.find(m => m.key === k);
    for (const c of COUNTRIES) {
      let v = null;
      if (k === 'score') v = CountryData.score(c.iso3).total;
      else { const x = CountryData.get(c.iso3, k); v = x ? x.value : null; }
      if (Number.isFinite(v)) values.set(c.iso3, v);
    }
    let color, label, fmtF;
    if (ind) { color = v => macroColor(ind, v); label = ind.label; fmtF = v => fmtMacro(ind, v) + ' ' + ind.unit; }
    else if (k === 'score') { color = v => divergingColor((v - 50) / 30); label = 'Skor negara'; fmtF = v => v + '/100'; }
    else if (k === 'polstab') { color = v => divergingColor(v / 1.5); label = 'Stabilitas politik WGI'; fmtF = v => fmt(v, 2); }
    else { color = v => divergingColor((v - 4) / 4); label = 'Cadangan devisa'; fmtF = v => fmt(v, 1) + ' bulan impor'; }
    S.globe.set('choropleth', { values, color, label, fmt: fmtF });
    const m = k === 'score' ? CountryData.meta.growth : CountryData.meta[k];
    setStatus('choropleth', values.size ? (m && m.stale ? 'stale' : 'ok') : (m && m.ok === false ? 'na' : 'loading'), values.size + ' negara');
    legend();
  }
  function legend() {
    const ch = S.globe.get('choropleth');
    const parts = [];
    if (vis.choropleth && ch) {
      const ind = MACRO.find(m => m.key === S.metric);
      const lowTxt = ind ? (ind.good === 'low' ? 'tinggi (buruk)' : ind.good === 'size' ? 'kecil' : 'lemah') : 'rendah';
      const hiTxt = ind ? (ind.good === 'low' ? 'rendah (baik)' : ind.good === 'size' ? 'besar' : 'kuat') : 'tinggi';
      const ramp = ind && ind.good === 'size' ? 'linear-gradient(90deg,#1e3a5a,#6fb1ff)' : 'linear-gradient(90deg,#ff6f61,#2b4560 50%,#34d1a4)';
      parts.push(`<span>${esc(ch.label)}: ${lowTxt}<i class="ramp" style="background:${ramp}"></i>${hiTxt}</span><span><i class="sw" style="background:#1a2c40"></i>tidak ada data</span>`);
      const m = S.metric === 'score' ? null : CountryData.meta[S.metric];
      if (m && m.ok !== false) parts.push(`<span>${qBadge(m.stale ? 'stale' : m.fallback || S.metric === 'polstab' || S.metric === 'reservesMonths' ? 'historical' : 'projection')} ${esc(m.sourceName || '')}${m.fetchedAt ? ' · ' + esc(fmtAge(m.fetchedAt)) : ''}</span>`);
      if (S.metric === 'score') parts.push(`<span>${qBadge('calculated')} skor eksperimental dari IMF + World Bank</span>`);
    }
    if (vis.hazards && S.hz && S.hz.ok) parts.push(`<span><i class="sw" style="background:#f3d79a;border-radius:50%"></i>Gempa M4,5+ (USGS)</span><span><i class="sw" style="background:#ff9f6b"></i>GDACS</span>`);
    if (vis.news && S.news && S.news.ok) parts.push(`<span><i class="sw" style="border:1px solid #e0b15a;border-radius:50%"></i>Lokasi berita 24 jam (GDELT)</span>`);
    if (vis.ships) parts.push(`<span><i class="sw" style="background:#ff9f6b"></i>tanker <i class="sw" style="background:#6fb1ff;margin-left:6px"></i>kargo</span>`);
    $('#intelLegend').innerHTML = parts.join('') || '<span class="meta">Nyalakan lapisan di atas globe.</span>';
  }

  /* ---------------- data lapisan ---------------- */
  async function loadEconomy() {
    setStatus('choropleth', 'loading');
    await CountryData.loadCore();
    choropleth();
  }
  async function loadHazards() {
    setStatus('hazards', 'loading');
    const r = await HazardData.load();
    S.hz = r;
    const partStale = r.parts && [r.parts.usgs, r.parts.gdacs].some(p => p && p.ok && p.stale);
    if (r.ok) { S.globe.set('hazards', r.items); setStatus('hazards', r.stale || partStale ? 'stale' : 'ok', r.items.length + ' peristiwa' + (partStale ? ' (sebagian salinan lama)' : '')); }
    else setStatus('hazards', 'na', r.error);
    feed(); legend();
  }
  async function loadNews() {
    setStatus('news', 'loading');
    const r = await NewsGeo.load();
    S.news = r;
    if (r.ok) { S.globe.set('news', r.data); setStatus('news', r.stale ? 'stale' : 'ok', r.data.length + ' lokasi'); }
    else setStatus('news', 'na', r.error);
    feed(); legend();
  }
  async function loadShips() {
    if (!vis.ships) return;
    if (layerStatus.ships !== 'ok') setStatus('ships', 'loading');
    const r = await ShipData.ships();
    if (r.ok) {
      S.globe.set('ships', r.vessels); if (r.boxes) S.globe.set('boxes', Object.values(r.boxes));
      setStatus('ships', r.vessels.length ? 'ok' : 'na', r.vessels.length ? r.vessels.length + ' kapal' : 'Belum ada posisi AIS');
    } else { S.globe.set('ships', []); setStatus('ships', 'na', 'Data AIS live tidak tersedia: ' + r.error); }
    /* panel kapal terpilih ikut diperbarui; bila kapal hilang atau data gagal, labelnya Basi */
    if (S.sel && S.sel.type === 'ship' && $('#intelSide')) {
      const fresh = r.ok ? r.vessels.find(x => x.mmsi === S.sel.item.mmsi) : null;
      if (fresh) S.sel = { ...S.sel, item: fresh };
      $('#intelSide').innerHTML = shipPanel(S.sel.item, fresh && !r.stale ? undefined : 'stale');
    }
  }
  async function loadChoke() {
    setStatus('chokepoints', 'loading');
    const r = await ShipData.chokepoints();
    S.choke = r;
    if (r.ok) { S.globe.set('chokepoints', r.data.summary.filter(k => Number.isFinite(k.lat))); setStatus('chokepoints', r.stale ? 'stale' : 'ok'); }
    else {
      S.globe.set('chokepoints', CHOKE_REF.map(c => ({ name: c[1], short: c[2], lat: c[3], lon: c[4], avg7: null, chg: null, context: c[5], series: [] })));
      setStatus('chokepoints', 'na', 'Transit PortWatch tidak tersedia; lokasi saja');
    }
    feed();
  }
  function refreshMarkets() { S.globe.set('markets', marketPoints()); setStatus('markets', INSTS.some(i => i.type === 'index' && i.real) ? 'ok' : State.demo ? 'stale' : 'na', State.demo ? 'Mode demo: indeks simulasi' : 'Indeks nyata butuh server (FRED/Yahoo)'); }

  /* ---------------- panel samping ---------------- */
  function side(h) {
    S.sel = h;
    const el = $('#intelSide'), title = $('#intelSideTitle'), badge = $('#intelSideBadge');
    badge.innerHTML = '';
    if (!h) { title.textContent = 'Detail'; el.innerHTML = help(); return; }
    if (h.type === 'country') {
      const c = C3.get(h.iso3) || h.item;
      title.textContent = c.name;
      const sc = CountryData.score(c.iso3);
      badge.innerHTML = `<span class="iso" style="font-family:var(--font-num);color:var(--brass)">${esc(c.iso3)}</span>`;
      el.innerHTML = `<p class="lead">${esc(c.en)} · ${esc(c.sub || c.region)} · ibu kota ${esc(c.capital || '–')} · ${esc(c.cur || '')}</p>
        <dl class="kv">${['growth', 'infl', 'unemp', 'debt', 'ca', 'gdp'].map(k => { const ind = MACRO.find(m => m.key === k); return `<div><dt>${esc(ind.label)}</dt><dd>${macroCell(c.iso3, ind, { year: true })} <small>${esc(ind.unit)}</small></dd></div>`; }).join('')}
          <div><dt>Skor negara ${qBadge('calculated')}</dt><dd>${sc.total ?? '–'}<small> /100</small></dd></div>
          <div><dt>Stabilitas politik</dt><dd>${macroCell(c.iso3, WB_BULK[1], { year: true })}</dd></div></dl>
        <div class="pillset"><button type="button" class="btn" data-go="country">Buka intelijen negara</button><button type="button" class="mini-btn" data-go="news">Berita dan spekulasi</button></div>
        <div id="intelCountryNews"><p class="loading">Judul terbaru tentang ${esc(c.name)}</p></div>`;
      CountryData.news(c, 'about', '3d').then(r => {
        const box = $('#intelCountryNews'); if (!box || S.sel !== h) return;
        if (!r.ok) { box.innerHTML = unavailableBox('Berita', r); return; }
        const sum = Analytics.summarizeNews(r.data.slice(0, 40));
        box.innerHTML = `<h3>Isu utama</h3><div class="pillset">${sum.themes.slice(0, 5).map(t => `<span class="tpill">${esc(t.label)} · ${t.n}</span>`).join('') || '<span class="hint">–</span>'}</div>
          <h3 style="margin-top:8px">Judul terbaru</h3><div class="list">${sum.analyzed.slice(0, 6).map(n => `<div><a class="item-title" href="${safeUrl(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a><div class="item-meta"><span>${esc(n.domain)}</span><span>${esc(fmtAge(n.seen))}</span>${n.a.speculative ? '<span class="tpill spec">spekulatif</span>' : ''}</div></div>`).join('')}</div>${srcLine(r)}`;
      });
      return;
    }
    if (h.type === 'ship') { title.textContent = 'Kapal'; el.innerHTML = shipPanel(h.item); return; }
    if (h.type === 'chokepoint') { title.textContent = 'Chokepoint'; el.innerHTML = chokePanel(h.item, S.choke); return; }
    if (h.type === 'hazard') {
      const z = h.item;
      title.textContent = HAZ_LABEL[z.kind] || z.kind;
      el.innerHTML = `<p class="lead"><b>${esc(z.title)}</b></p>
        <dl class="kv"><div><dt>Waktu</dt><dd>${esc(fmtTime(z.time))}</dd></div><div><dt>Sumber</dt><dd>${esc(z.source)}</dd></div>
        ${z.mag ? `<div><dt>Magnitudo</dt><dd>${fmt(z.mag, 1)}</dd></div><div><dt>Kedalaman</dt><dd>${fmt(z.depth, 0)} km</dd></div>` : ''}
        ${z.alert ? `<div><dt>Tingkat peringatan</dt><dd>${esc(z.alert)}</dd></div>` : ''}${z.severity ? `<div><dt>Keparahan</dt><dd style="white-space:normal;font-family:var(--font-ui);font-size:12px">${esc(z.severity)}</dd></div>` : ''}
        <div><dt>Lokasi</dt><dd>${fmt(z.lat, 2)}, ${fmt(z.lon, 2)}</dd></div>${z.tsunami ? '<div><dt>Tsunami</dt><dd class="down">ada flag tsunami</dd></div>' : ''}</dl>
        ${z.url ? `<p><a href="${safeUrl(z.url)}" target="_blank" rel="noopener noreferrer">Laporan resmi ${esc(z.source)}</a></p>` : ''}
        <p class="lead">${qBadge('inference')} Dampak ekonomi bergantung lokasi: cek apakah ada pelabuhan, tambang, kilang, atau pabrik besar di dekatnya. ${esc(Analytics.CHAINS.disaster.second)}</p>`;
      return;
    }
    if (h.type === 'news') {
      const n = h.item;
      title.textContent = n.name || 'Lokasi berita';
      el.innerHTML = `<p class="lead">${n.count} artikel dalam 24 jam menyebut lokasi ini bersama kata kunci ekonomi/politik/konflik (GDELT GEO). ${qBadge('delayed')}</p>
        <div class="list">${n.articles.map(a => { const x = Analytics.analyzeHeadline(a.title); return `<div><a class="item-title" href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a><div class="item-meta">${x.themes.slice(0, 2).map(t => `<span class="tpill">${esc(t.label)}</span>`).join('')}${x.speculative ? '<span class="tpill spec">spekulatif</span>' : ''}</div></div>`; }).join('') || '<p class="hint">GDELT tidak menyertakan judul untuk titik ini.</p>'}</div>`;
      return;
    }
    if (h.type === 'market') {
      const m = MARKETS[h.item.id], inst = BY[m.idx];
      title.textContent = inst.name;
      el.innerHTML = `<p class="lead">${esc(m.city)} · ${esc(m.ex)} · ${statusOf(m.id).open ? 'buka' : 'tutup'}</p>
        <dl class="kv"><div><dt>Level</dt><dd>${fmt(inst.price, 2)}</dd></div><div><dt>Perubahan</dt><dd class="${sign(pct(inst))}">${fmtPct(pct(inst))}</dd></div>
        <div><dt>Kualitas</dt><dd>${qBadge(inst.quality || 'unavailable')}</dd></div><div><dt>Sumber</dt><dd style="white-space:normal;font-family:var(--font-ui);font-size:11.5px">${esc(inst.srcName || 'tidak tersedia')}</dd></div></dl>
        <div class="pillset"><button type="button" class="btn" data-go="chart" data-sym="${m.idx}">Buka grafik</button><button type="button" class="mini-btn" data-go="mcountry" data-iso2="${m.id === 'UK' ? 'GB' : m.id}">Negara</button></div>`;
    }
  }
  function help() {
    return `<p class="lead">Seret globe untuk memutar, gulir atau cubit untuk zoom, klik untuk memilih. Panah keyboard juga bisa saat globe difokus.</p>
      <ul class="list">
        <li><b>Ekonomi</b>: warna negara menurut metrik di kanan atas (IMF WEO / World Bank).</li>
        <li><b>Pasar</b>: bursa dunia; berdenyut saat buka.</li>
        <li><b>Berita</b>: lokasi yang paling banyak disebut berita 24 jam (GDELT).</li>
        <li><b>Bencana</b>: gempa USGS dan peringatan GDACS.</li>
        <li><b>Kapal</b>: posisi AIS asli (butuh server untuk global).</li>
        <li><b>Chokepoint</b>: transit harian selat penting (IMF PortWatch).</li>
      </ul>`;
  }

  /* ---------------- daftar peristiwa di bawah globe ---------------- */
  function feed() {
    const el = $('#intelFeed'), meta = $('#feedMeta');
    if (S.feed === 'hazards') {
      const r = S.hz;
      if (!r) { el.innerHTML = '<p class="loading">Memuat bencana</p>'; return; }
      if (!r.ok) { el.innerHTML = unavailableBox('Bencana', r); meta.textContent = ''; return; }
      const items = [...r.items].sort((a, b) => (b.time || '').localeCompare(a.time || '')).slice(0, 80);
      /* sebutkan sumber yang gagal; jangan menulis "USGS + GDACS" kalau salah satunya tidak ada */
      const pu = r.parts && r.parts.usgs, pg = r.parts && r.parts.gdacs;
      const srcTxt = [pu && pu.ok ? 'USGS' + (pu.stale ? ' (salinan lama)' : '') : 'USGS gagal: ' + ((pu && pu.error) || '?'), pg && pg.ok ? 'GDACS' + (pg.stale ? ' (salinan lama)' : '') : 'GDACS gagal: ' + ((pg && pg.error) || '?')].join(' · ');
      meta.innerHTML = `${items.length} terbaru · ${esc(String(srcTxt).slice(0, 220))}`;
      if (!items.length) { el.innerHTML = '<p class="hint" style="padding:12px 14px">Tidak ada peristiwa dalam data yang berhasil dimuat.</p>'; el._items = []; return; }
      el.innerHTML = items.map((z, i) => `<button type="button" class="feed-row" data-hz="${i}"><span class="t">${esc(fmtTime(z.time))}</span><span class="w">${esc(HAZ_LABEL[z.kind] || z.kind)}${z.mag ? ' M' + fmt(z.mag, 1) : ''} · ${esc(z.title)}</span><span class="s">${esc(z.alert || z.source)}</span></button>`).join('');
      el._items = items;
    } else if (S.feed === 'news') {
      const r = S.news;
      if (!vis.news && !r) { el.innerHTML = '<p class="hint" style="padding:12px 14px">Nyalakan lapisan Berita untuk memuat lokasi berita (1 permintaan GDELT).</p>'; meta.textContent = ''; return; }
      if (!r) { el.innerHTML = '<p class="loading">Memuat GDELT GEO</p>'; return; }
      if (!r.ok) { el.innerHTML = unavailableBox('Lokasi berita', r); meta.textContent = ''; return; }
      const items = [...r.data].sort((a, b) => b.count - a.count).slice(0, 80);
      meta.textContent = 'lokasi paling banyak disebut, 24 jam';
      el.innerHTML = items.map((n, i) => `<button type="button" class="feed-row" data-nw="${i}"><span class="t">${n.count} art.</span><span class="w">${esc(n.name)}${n.articles[0] ? ' · ' + esc(n.articles[0].title) : ''}</span><span class="s">GDELT</span></button>`).join('');
      el._items = items;
    } else {
      const r = S.choke;
      if (!r) { el.innerHTML = '<p class="loading">Memuat PortWatch</p>'; return; }
      if (!r.ok) { el.innerHTML = unavailableBox('Chokepoint', r); meta.textContent = ''; return; }
      const items = [...r.data.summary].sort((a, b) => (a.chg ?? 0) - (b.chg ?? 0));
      meta.textContent = 'diurutkan dari penurunan transit terbesar';
      el.innerHTML = items.map((k, i) => `<button type="button" class="feed-row" data-ck="${i}"><span class="t">${esc(k.lastDate)}</span><span class="w">${esc(k.name)} · rata 7 hari ${fmt(k.avg7, 1)} kapal/hari</span><span class="s ${sign(k.chg)}">${Number.isFinite(k.chg) ? fmtPct(k.chg, 1) : '–'}</span></button>`).join('');
      el._items = items;
    }
  }

  function build() {
    if (built) return;
    built = true;
    S.globe = createGlobe($('#intelGlobe'), { onAuto: on => { const b = $('#page-intel [data-g="spin"]'); if (b) b.setAttribute('aria-pressed', String(on)); }, visible: vis, onPick: h => side(h), label: 'Globe intelijen: ekonomi, pasar, berita, bencana, kapal' });
    chips(); metricOptions(); side(null);
    $('#layerChips').addEventListener('click', e => {
      const b = e.target.closest('[data-l]'); if (!b) return;
      const k = b.dataset.l; vis[k] = !vis[k];
      b.setAttribute('aria-pressed', String(vis[k])); S.globe.show(k, vis[k]); Store.set('intelLayers', vis);
      if (vis[k] && k === 'news' && !S.news) loadNews();
      if (vis[k] && k === 'ships') loadShips();
      legend();
    });
    $('#econMetric').addEventListener('change', e => { S.metric = e.target.value; Store.set('intelMetric', S.metric); choropleth(); });
    $('#page-intel .globe-card .seg').addEventListener('click', e => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      const g = b.dataset.g;
      if (g === 'in') S.globe.zoomBy(1.4); if (g === 'out') S.globe.zoomBy(1 / 1.4);
      if (g === 'reset') { S.globe.reset(); side(null); }
      if (g === 'spin') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); S.globe.setAuto(on); }
    });
    $('#feedSeg').addEventListener('click', e => {
      const b = e.target.closest('[data-feed]'); if (!b) return;
      S.feed = b.dataset.feed; $$('#feedSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      if (S.feed === 'news' && !S.news && vis.news) loadNews();
      feed();
    });
    $('#intelFeed').addEventListener('click', e => {
      const el = $('#intelFeed'), b = e.target.closest('.feed-row'); if (!b) return;
      const it = el._items[+(b.dataset.hz ?? b.dataset.nw ?? b.dataset.ck)];
      const type = b.dataset.hz !== undefined ? 'hazard' : b.dataset.nw !== undefined ? 'news' : 'chokepoint';
      const h = { type, item: it }; S.globe.select(h); side(h);
      if (Number.isFinite(it.lat)) S.globe.flyTo(it.lon, it.lat, type === 'chokepoint' ? 20 : 4);
    });
    $('#intelSide').addEventListener('click', e => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      const g = b.dataset.go;
      if (g === 'country' || g === 'news') { CountryPage.open(S.sel.iso3, g === 'news' ? 'news' : 'overview'); App.showPage('country'); }
      if (g === 'chart') bus.emit('pickSym', { sym: b.dataset.sym, go: true });
      if (g === 'mcountry') { const c = C2.get(b.dataset.iso2); if (c) { CountryPage.open(c.iso3, 'overview'); App.showPage('country'); } }
    });
    bus.on('countryData', () => { if (S.globe) { choropleth(); if (S.sel && S.sel.type === 'country') side(S.sel); } });
    bus.on('tick', () => { if (S.globe && vis.markets && !$('#page-intel').hidden) refreshMarkets(); });
  }
  return {
    show() {
      build();
      S.globe.resize();
      refreshMarkets();
      loadEconomy(); loadHazards(); loadChoke();
      if (vis.news) loadNews();
      loadShips();
      clearInterval(S.shipTimer);
      S.shipTimer = setInterval(() => { if (!$('#page-intel').hidden && !document.hidden) loadShips(); }, 12000);
      feed();
    },
    hide() { clearInterval(S.shipTimer); },
    get globe() { return S.globe; },
    /* dipakai palet perintah: ganti metrik warna globe tanpa memuat ulang halaman */
    setMetric(key) {
      S.metric = key; Store.set('intelMetric', key);
      if (S.globe) { metricOptions(); choropleth(); }
    },
    focusCountry(iso3) {
      build();
      const ll = countryCentroid(iso3);
      if (ll) S.globe.flyTo(ll[0], ll[1], 2.2);
      const h = { type: 'country', iso3, item: C3.get(iso3) };
      S.globe.select(h); side(h);
    },
  };
})();
