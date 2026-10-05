/* =====================================================================
   APLIKASI: menyambungkan semua modul (peta, grafik, daftar, kas)
   ===================================================================== */
const App = (() => {
  const rowsEl = $('#rows');
  const rowMap = new Map();

  /* ---------- pita harga di atas ---------- */
  function buildTape() {
    const one = TAPE_SYMS.map(s => `<span class="tp" data-sym="${s}"><b>${esc(s)}</b><span class="px num"></span><span class="ch num"></span></span>`).join('');
    $('#tapeTrack').innerHTML = `<div class="tape-set">${one}</div><div class="tape-set dup">${one}</div>`;
    updateTape(TAPE_SYMS.map(s => BY[s]));
  }
  function updateTape(changed) {
    for (const i of changed) {
      if (!TAPE_SYMS.includes(i.sym)) continue;
      const p = pct(i);
      $$(`#tapeTrack .tp[data-sym="${i.sym}"]`).forEach(el => {
        $('.px', el).textContent = fmt(i.price, i.dp);
        const ch = $('.ch', el); ch.textContent = fmtPct(p); ch.className = 'ch num ' + sign(p);
      });
    }
  }

  /* ---------- daftar saham di kanan ---------- */
  function sparkPath(arr) {
    if (arr.length < 2) return '';
    let lo = Infinity, hi = -Infinity;
    for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    return arr.map((v, k) => (k ? 'L' : 'M') + (k / (arr.length - 1) * 62).toFixed(1) + ' ' + (22 - (v - lo) / span * 20).toFixed(1)).join(' ');
  }
  function buildRows() {
    rowsEl.innerHTML = STOCKS.map(i =>
      `<li data-sym="${i.sym}"><button type="button" class="row" data-sym="${i.sym}" aria-pressed="false">` +
      `<span class="r-id"><span class="sym">${esc(i.sym)}<span class="tag"></span></span><span class="nm">${esc(i.name)}</span></span>` +
      `<svg class="spark" viewBox="0 0 62 24" preserveAspectRatio="none" aria-hidden="true"><path d=""/></svg>` +
      `<span class="r-px"><span class="px num"></span><span class="chg num"></span></span></button></li>`).join('') +
      `<li class="no-rows" hidden>Tidak ada yang cocok. Coba kode lain atau pilih filter Semua.</li>`;
    for (const i of STOCKS) {
      const li = $(`li[data-sym="${i.sym}"]`, rowsEl);
      rowMap.set(i.sym, { li, btn: $('.row', li), px: $('.px', li), chg: $('.chg', li), spark: $('.spark', li), path: $('path', li), tag: $('.tag', li), last: i.price });
      updateRow(i, false);
      updateSpark(i);
    }
  }
  function updateTag(i) {
    const r = rowMap.get(i.sym);
    const q = i.quality;
    const html = q === 'live' ? '<span class="tag-live">live</span>' : q === 'sim' ? '<span class="tag-sim" title="Harga simulasi (mode demo)">sim</span>' : q === 'unavailable' ? '<span class="tag-na" title="Tidak ada sumber harga">n/a</span>'
      : (q === 'eod' || q === 'unofficial' || q === 'delayed' || q === 'stale') ? `<span class="tag-del" title="${esc((QUALITY[q] || [q])[0] + (i.srcName ? ': ' + i.srcName : ''))}">${q === 'eod' ? 'harian' : q === 'stale' ? 'basi' : 'tunda'}</span>`
      : (i.type !== 'crypto' && !isOpen(i)) ? '<span class="tag-closed">tutup</span>' : '';
    if (r.tag.innerHTML !== html) r.tag.innerHTML = html;
  }
  function updateRow(i, flash) {
    const r = rowMap.get(i.sym), p = pct(i);
    r.px.textContent = fmt(i.price, i.dp);
    r.chg.textContent = fmtPct(p); r.chg.className = 'chg num ' + sign(p);
    r.spark.style.color = p >= 0 ? 'var(--up)' : 'var(--down)';
    if (flash && i.price !== r.last && !REDUCED) {
      r.px.classList.remove('flash-up', 'flash-down');
      void r.px.offsetWidth;
      r.px.classList.add(i.price > r.last ? 'flash-up' : 'flash-down');
    }
    r.last = i.price;
    updateTag(i);
  }
  function updateSpark(i) { rowMap.get(i.sym).path.setAttribute('d', sparkPath(i.spark)); }

  function visibleList() {
    const q = State.q.trim().toLowerCase();
    let list = STOCKS.filter(i =>
      (State.region === 'ALL' || i.region === State.region) &&
      (!q || i.sym.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)));
    const pv = (i, d) => (Number.isFinite(pct(i)) ? pct(i) : d);
    if (State.tab === 'up') list = [...list].sort((a, b) => pv(b, -Infinity) - pv(a, -Infinity));
    else if (State.tab === 'down') list = [...list].sort((a, b) => pv(a, Infinity) - pv(b, Infinity));
    return list;
  }
  function applyView() {
    const list = visibleList();
    const show = new Set(list);
    const empty = $('.no-rows', rowsEl);
    list.forEach(i => rowsEl.insertBefore(rowMap.get(i.sym).li, empty));
    for (const i of STOCKS) rowMap.get(i.sym).li.hidden = !show.has(i);
    empty.hidden = list.length > 0;
    $('#wCount').textContent = `${list.length} dari ${STOCKS.length}`;
    updateBreadth(list);
  }
  function updateBreadth(list = visibleList()) {
    const up = list.filter(i => pct(i) > 0).length, dn = list.filter(i => pct(i) < 0).length;
    const tot = Math.max(up + dn, 1);
    $('#breadth').innerHTML =
      `<div class="b-row"><span>Naik <b class="up num">${up}</b></span><span>Turun <b class="down num">${dn}</b></span></div>` +
      `<div class="bar" role="img" aria-label="${up} naik, ${dn} turun"><i style="width:${up / tot * 100}%"></i><i style="width:${dn / tot * 100}%"></i></div>`;
  }
  function buildChips() {
    $('#chips').innerHTML = REGIONS.map(([k, label]) => `<button type="button" data-r="${k}" aria-pressed="${State.region === k}">${label}</button>`).join('');
  }
  function highlightRow() {
    for (const [sym, r] of rowMap) r.btn.setAttribute('aria-pressed', String(sym === State.sel));
  }

  /* ---------- kartu kesehatan keuangan ---------- */
  /* panel v1: ringkasan bursa (indeks) dan skor kesehatan sintetis (hanya mode demo) */
  function legacyHealth(inst, el) {
    const flag = $('#hFlag');
    if (inst.type === 'index') {
      flag.hidden = !State.demo || inst.real;
      const m = MARKETS[inst.mkt], st = statusOf(inst.mkt);
      const hh = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
      const local = new Intl.DateTimeFormat('id-ID', { timeZone: m.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      const hrs = (m.sessFri && new Date().getDay() === 5 ? m.sessFri : m.sess).map(([a, b]) => hh(a) + '–' + hh(b)).join(', ');
      const members = STOCKS.filter(x => x.mkt === inst.mkt);
      const p = pct(inst);
      el.innerHTML = `
        <div class="h-verdict"><strong>${esc(m.city)}</strong><p>${esc(m.ex)}, indeks ${esc(inst.name)} <span class="${sign(p)} num">${fmtPct(p)}</span> hari ini.</p></div>
        <ul class="ratios">
          <li><span>Status</span><span class="v ${st.open ? 'up' : ''}">${st.label}</span></li>
          <li><span>${st.open ? 'Tutup' : 'Buka'}</span><span class="v">${esc(st.detail.replace(/^(tutup|buka) dalam /, 'dalam '))}</span></li>
          <li><span>Waktu setempat</span><span class="v">${local}</span></li>
          <li><span>Jam reguler</span><span class="v">${hrs}</span></li>
        </ul>
        <div><h3 class="sub">Saham dari bursa ini di daftar</h3>
          ${members.length ? `<div class="mini-list">${members.map(x => `<button type="button" data-pick="${x.sym}"><span>${esc(x.sym)}<small>${esc(x.name)}</small></span><span class="num ${sign(pct(x))}">${fmtPct(pct(x))}</span></button>`).join('')}</div>`
          : '<p class="sim-note">Belum ada saham dari bursa ini di daftar kanan.</p>'}</div>
        <p class="sim-note">${inst.real ? 'Level indeks dari ' + esc(inst.srcName) + '.' : State.demo ? 'Level indeks di sini disimulasikan (mode demo).' : 'Level indeks tidak tersedia tanpa server (FRED/Yahoo).'}</p>`;
      return;
    }
    if (inst.type !== 'stock') {
      flag.hidden = true;
      el.innerHTML = `<p class="empty">Aset kripto tidak punya laporan keuangan perusahaan, jadi skor ini tidak berlaku. Pilih sebuah saham untuk melihat skornya.</p>`;
      return;
    }
    flag.hidden = false;
    const h = evaluate(inst);
    const col = { Sehat: 'var(--up)', Waspada: 'var(--brass)', Buruk: 'var(--down)' }[h.label] || 'var(--ink-3)';
    const verdict = {
      Sehat: 'Fundamental kuat menurut Piotroski dan Altman.',
      Waspada: 'Sinyalnya campuran. Periksa poin yang perlu diwaspadai.',
      Buruk: 'Beberapa indikator menunjukkan tekanan keuangan.',
      'Data kurang': 'Data laporan tidak cukup untuk menghitung skor.',
    }[h.label];
    const C = 2 * Math.PI * 46;
    const sc = Number.isFinite(h.score) ? Math.round(h.score) : 0;
    const altTxt = h.bank ? '<span class="ink2">tidak berlaku untuk bank</span>' : Number.isFinite(h.az.z) ? `<b class="num">${h.az.z.toFixed(2)}</b> <span class="ink2">zona ${h.az.zone.toLowerCase()}</span>` : '<span class="ink2">data kurang</span>';
    const fmtR = r => !Number.isFinite(r.v) ? 'n/a' : r.kind === 'pct' ? (r.v * 100).toFixed(1) + '%' : r.v.toFixed(2) + 'x';
    el.innerHTML = `
      <div class="h-top">
        <svg class="ring" viewBox="0 0 110 110" role="img" aria-label="Skor ${sc} dari 100, ${h.label}">
          <circle class="trk" cx="55" cy="55" r="46" fill="none" stroke-width="9"/>
          <circle class="bar" cx="55" cy="55" r="46" fill="none" stroke-width="9" stroke="${col}" stroke-dasharray="${(sc / 100 * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 55 55)"/>
          <text x="55" y="58" text-anchor="middle" font-size="27" font-weight="500">${Number.isFinite(h.score) ? sc : '–'}</text>
          <text x="55" y="74" text-anchor="middle" font-size="9.5" style="fill:var(--ink-3)">dari 100</text>
        </svg>
        <div class="h-verdict"><strong style="color:${col}">${h.label}</strong><p>${verdict}</p></div>
      </div>
      <div class="pio"><span class="lbl">Piotroski <b class="num">${h.p.score}/${h.p.available}</b></span>
        <div class="cells" aria-hidden="true">${h.p.items.map(x => `<i class="${x.ok === true ? 'ok' : x.ok === false ? 'no' : ''}"></i>`).join('')}</div></div>
      <div class="alt"><span class="lbl">Altman Z''</span><span>${altTxt}</span></div>
      <ul class="ratios">${h.ratios.map(r => `<li><span>${r.name}</span><span class="v ${r.tone}">${fmtR(r)}</span></li>`).join('')}</ul>
      <div class="why">
        <div><h3>Yang kuat</h3><ul class="good">${h.good.slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('') || '<li>Belum ada</li>'}</ul></div>
        <div><h3>Yang perlu diwaspadai</h3><ul class="bad">${h.bad.slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('') || '<li>Belum ada</li>'}</ul></div>
      </div>
      <details><summary>Lihat 9 kriteria Piotroski</summary><ol>
        ${h.p.items.map(x => `<li><span class="m ${x.ok === true ? 'up' : x.ok === false ? 'down' : ''}">${x.ok === true ? '✓' : x.ok === false ? '✗' : '–'}</span><span>${esc(x.name)}<small>${esc(x.detail)}</small></span></li>`).join('')}</ol></details>
      <p class="sim-note">Angka laporan keuangan di sini sintetis, hanya rumusnya yang nyata. Jangan dipakai untuk menilai perusahaan sungguhan.</p>`;
  }

  function renderHealth(inst) { AssetPanel.render(inst, $('#healthBody'), $('#hFlag')); }

  /* ---------- pilih instrumen ---------- */
  function select(sym, go) {
    const inst = BY[sym]; if (!inst) return;
    State.sel = sym; Store.set('sel', sym);
    ChartView.select(inst);
    renderHealth(inst);
    highlightRow();
    MapView.setSelected(inst.type === 'crypto' ? null : inst.mkt);
    if (go) showPage('market');
  }
  bus.on('pickSym', ({ sym, go }) => select(sym, go));
  $('#healthBody').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) select(b.dataset.pick); });
  bus.on('openCountry', iso3 => { CountryPage.open(iso3, 'overview'); showPage('country'); });
  bus.on('intelCountry', iso3 => { showPage('intel'); IntelPage.focusCountry(iso3); });
  bus.on('pickMarket', id => {
    const m = MARKETS[id];
    State.region = m.region || 'ALL';
    buildChips(); applyView();
    rowsEl.scrollTop = 0;
    select(m.idx, true);
  });

  /* ---------- halaman ---------- */
  const PAGES = { intel: IntelPage, country: CountryPage, news: NewsPage, ships: ShipsPage, macro: MacroPage, sources: SourcesPage };
  let curPage = 'market';
  function showPage(p) {
    if (!$('#page-' + p)) p = 'market';
    if (curPage !== p && PAGES[curPage] && PAGES[curPage].hide) PAGES[curPage].hide();
    curPage = p;
    $$('.page').forEach(el => { el.hidden = el.id !== 'page-' + p; });
    $$('.nav button').forEach(b => { if (b.dataset.page === p) { b.setAttribute('aria-current', 'page'); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else b.removeAttribute('aria-current'); });
    if (p === 'market') requestAnimationFrame(() => { MapView.resize(); if (marketGlobe) marketGlobe.resize(); });
    if (p === 'cash') Cash.render();
    if (PAGES[p]) PAGES[p].show();
    Store.set('page', p);
    if (location.hash !== '#' + p) history.replaceState(null, '', '#' + p);
    window.scrollTo(0, 0);
  }
  let marketGlobe = null;
  function ensureMarketGlobe() {
    if (marketGlobe) return marketGlobe;
    marketGlobe = createGlobe($('#marketGlobe'), {
      zoom: 1, autoRotate: true, visible: { choropleth: false, news: false, hazards: false, ships: false, chokepoints: false, boxes: false },
      onPick: h => { if (h.type === 'market') bus.emit('pickMarket', h.item.id); else if (h.type === 'country') bus.emit('openCountry', h.iso3); },
      label: 'Globe pasar dunia: bursa dan perubahan indeks hari ini',
    });
    marketGlobe.set('markets', marketPoints());
    bus.on('tick', () => { if (!$('#marketGlobe').hidden) marketGlobe.set('markets', marketPoints()); });
    return marketGlobe;
  }

  /* ---------- kontrol ---------- */
  function wire() {
    $('.nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showPage(b.dataset.page); });

    $('#chips').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      State.region = b.dataset.r; buildChips(); applyView();
    });
    $('#q').addEventListener('input', e => { State.q = e.target.value; applyView(); });
    $('#wTabs').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      State.tab = b.dataset.tab;
      $$('#wTabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      applyView();
    });
    rowsEl.addEventListener('click', e => { const b = e.target.closest('.row'); if (b) select(b.dataset.sym); });

    $('.map-card .seg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset.view;
      $$('.map-card .seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      $('#mapBody').hidden = v !== 'map'; $('#hoursBody').hidden = v !== 'hours'; $('#marketGlobe').hidden = v !== 'globe';
      $('.legend').style.visibility = v === 'hours' ? 'hidden' : 'visible';
      Store.set('mapView', v);
      if (v === 'hours') HoursView.render();
      else if (v === 'globe') requestAnimationFrame(() => ensureMarketGlobe().resize());
      else requestAnimationFrame(() => MapView.resize());
    });

    $('#tfSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      State.tf = b.dataset.tf; Store.set('tf', State.tf);
      $$('#tfSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      ChartView.reload();
    });
    $('#typeSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      State.type = b.dataset.type; Store.set('type', State.type);
      $$('#typeSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      ChartView.reload();
    });
    $('#btnMA').addEventListener('click', e => {
      State.ma = !State.ma; Store.set('ma', State.ma);
      e.currentTarget.setAttribute('aria-pressed', String(State.ma));
      ChartView.reload();
    });

    const dlg = $('#settings');
    $('#btnSettings').addEventListener('click', () => dlg.showModal());
    $('#setLive').checked = State.liveCrypto;
    $('#setForce').checked = State.forceOpen;
    $('#setLive').addEventListener('change', e => {
      State.liveCrypto = e.target.checked; Store.set('liveCrypto', State.liveCrypto);
      State.liveCrypto ? Live.start() : Live.stop();
    });
    $('#setForce').addEventListener('change', e => { State.forceOpen = e.target.checked; Store.set('force', State.forceOpen); });
    $('#setDemo').checked = State.demo;
    $('#setDemo').addEventListener('change', e => { Store.set('demo', e.target.checked); toast(e.target.checked ? 'Mode demo dinyalakan: memuat ulang.' : 'Mode demo dimatikan: memuat ulang.'); setTimeout(() => location.reload(), 600); });
    $('#setServer').value = Store.get('serverBase', 'http://localhost:8787');
    $('#setServerTest').addEventListener('click', async () => {
      const v = $('#setServer').value.trim().replace(/\/+$/, '');
      if (v && !/^https?:\/\/[\w.\-]+(:\d+)?$/.test(v)) { $('#setServerOut').textContent = 'Format alamat tidak valid. Contoh: http://localhost:8787'; return; }
      Store.set('serverBase', v || 'http://localhost:8787');
      $('#setServerOut').textContent = 'Mengetes…';
      const s = await Net.detect();
      $('#setServerOut').textContent = s ? 'Tersambung ke ' + s.base + '. Muat ulang halaman untuk memakai semua sumber server.' : 'Server tidak ditemukan di alamat itu. Pastikan "npm start" sedang berjalan.';
    });
    $('#srvChip').addEventListener('click', () => showPage('sources'));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); if (curPage === 'market') $('#q').focus(); else Palette.open(); }
    });
  }

  function syncControls() {
    $$('#tfSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tf === State.tf)));
    $$('#typeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === State.type)));
    $('#btnMA').setAttribute('aria-pressed', String(State.ma));
  }

  /* ---------- jam di pojok kanan atas ---------- */
  const clockFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
  function clock() {
    const o = {}; clockFmt.formatToParts(new Date()).forEach(p => { o[p.type] = p.value; });
    $('#clock').textContent = `${o.weekday} ${o.day} ${o.month}  ${o.hour}:${o.minute}:${o.second} ${o.timeZoneName}`;
  }

  function demoBanner() {
    const b = $('#demoBanner');
    if (State.demo) {
      b.hidden = false;
      b.innerHTML = `<strong>Mode demo aktif.</strong><span>Saham dan indeks tanpa sumber nyata memakai harga SIMULASI berlabel "sim". Data nyata tetap dipakai bila tersedia.</span><button type="button" class="mini-btn" id="demoOff">Matikan mode demo</button>`;
      $('#demoOff').addEventListener('click', () => { Store.set('demo', false); location.reload(); });
    } else b.hidden = true;
  }
  function serverChip(s) {
    const chip = $('#srvChip');
    chip.dataset.state = s ? 'on' : 'off';
    $('#srvText').textContent = s ? 'Server tersambung' : 'Tanpa server';
    chip.title = s ? 'Server lokal ' + s.base + ' · klik untuk status sumber data' : 'Server lokal tidak terdeteksi: sumber berkunci (FRED, kapal global, saham) tidak aktif. Klik untuk petunjuk.';
  }

  function init() {
    ChartView.init();
    buildRows(); buildChips(); buildTape(); wire(); syncControls();
    applyView();
    Cash.init();
    demoBanner();
    select(State.sel);
    clock(); setInterval(clock, 1000);
    MarketData.updateMode();
    bus.on('server', serverChip);
    Net.ready().then(async s => {
      if (s) { await MarketData.startServerSources(); ChartView.reload(); renderHealth(BY[State.sel]); }
    });
    const mv = Store.get('mapView', 'map');
    if (mv !== 'map') { const b = $(`.map-card .seg [data-view="${mv}"]`); if (b) b.click(); }
    const start = (location.hash || '').slice(1) || 'market';
    if (start !== 'market') showPage(start);
    window.addEventListener('hashchange', () => { const p = location.hash.slice(1); if (p && p !== curPage) showPage(p); });

    const lastQ = Object.fromEntries(INSTS.map(i => [i.sym, i.quality]));
    bus.on('tick', changed => {
      for (const i of changed) {
        /* aset terpilih baru dapat harga nyata pertama: segarkan panel intelijen & grafik */
        if (i.sym === State.sel && lastQ[i.sym] !== i.quality) { renderHealth(i); ChartView.reload(); }
        lastQ[i.sym] = i.quality;
      }
      for (const i of changed) if (rowMap.has(i.sym)) updateRow(i, true);
      updateTape(changed);
      updateBreadth();
      ChartView.onTick(changed);
    });
    setInterval(simTick, 1000);
    setInterval(() => { STOCKS.forEach(updateSpark); if (State.tab !== 'list') applyView(); }, 5000);
    setInterval(() => STOCKS.forEach(updateTag), 15000);
    if (State.liveCrypto) Live.start();
  }
  return { init, showPage, select, legacyHealth };
})();

App.init();
