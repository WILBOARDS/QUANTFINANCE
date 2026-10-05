/* =====================================================================
   PALET PERINTAH (Ctrl+K) + PENCARIAN UNIVERSAL + PROFIL TOKOH PUBLIK
   Contoh: AAPL · AAPL NEWS · BTC · INDONESIA · ID NEWS · COMPARE ID US CN
           OIL · US10Y · SHIP HORMUZ · N RUPIAH · Jensen Huang
   ===================================================================== */
const COMMANDS = [
  ['GLOBE', 'Buka globe intelijen 3D', () => App.showPage('intel')],
  ['MARKET', 'Halaman pasar dan grafik', () => App.showPage('market')],
  ['COUNTRY', 'Intelijen semua negara', () => App.showPage('country')],
  ['NEWS', 'Terminal berita global', () => App.showPage('news')],
  ['SHIP', 'Pergerakan kapal dan chokepoint', () => App.showPage('ships')],
  ['MACRO', 'Makro AS, obligasi, komoditas, rezim pasar', () => App.showPage('macro')],
  ['US10Y', 'Kurva imbal hasil obligasi AS', () => { App.showPage('macro'); setTimeout(() => $('.curve-card').scrollIntoView({ block: 'start' }), 50); }],
  ['OIL', 'Harga minyak, gas, komoditas', () => { App.showPage('macro'); setTimeout(() => $('.cmdty-card').scrollIntoView({ block: 'start' }), 50); }],
  ['REGIME', 'Rezim pasar risk on/off', () => { App.showPage('macro'); setTimeout(() => $('.regime-card').scrollIntoView({ block: 'start' }), 50); }],
  ['CB', 'Bank sentral dunia', () => { App.showPage('macro'); setTimeout(() => $('.cb-card').scrollIntoView({ block: 'start' }), 50); }],
  ['STRESS', 'Uji tekanan portofolio simulasi', () => { App.showPage('macro'); setTimeout(() => $('.stress-card').scrollIntoView({ block: 'start' }), 50); }],
  ['CASH', 'Kas dan alokasi surplus', () => App.showPage('cash')],
  ['SOURCES', 'Status sumber data dan API', () => App.showPage('sources')],
  ['SETTINGS', 'Pengaturan (mode demo, server)', () => $('#btnSettings').click()],
  ['HELP', 'Daftar perintah', null],
];
const CMD_ALIAS = { MAP: 'GLOBE', INTEL: 'GLOBE', PETA: 'GLOBE', PASAR: 'MARKET', NEGARA: 'COUNTRY', BERITA: 'NEWS', N: 'NEWS', KAPAL: 'SHIP', SHIPS: 'SHIP', MAKRO: 'MACRO', UST: 'US10Y', CURVE: 'US10Y', BOND: 'US10Y', BONDS: 'US10Y', BRENT: 'OIL', WTI: 'OIL', GAS: 'OIL', GOLD: 'OIL', COPPER: 'OIL', KOMODITAS: 'OIL', KAS: 'CASH', SUMBER: 'SOURCES', DATA: 'SOURCES' };

/* ---------- profil tokoh publik (Wikipedia + berita GDELT) ---------- */
const People = (() => {
  async function search(q) {
    return getData('wikipedia', {
      server: '/api/wiki/search?q=' + encodeURIComponent(q),
      direct: `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=6&format=json&origin=*`,
      parse: Parsers.parseWikiSearch, ttl: 24 * 3600e3, persist: true, key: 'wks:' + q.toLowerCase(),
    });
  }
  async function open(title) {
    let dlg = $('#personDlg');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'personDlg'; dlg.className = 'person-dlg'; dlg.setAttribute('aria-label', 'Profil tokoh publik');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    }
    dlg.innerHTML = `<div class="dlg"><p class="loading">Memuat profil ${esc(title)}</p></div>`;
    if (!dlg.open) dlg.showModal();
    const r = await getData('wikipedia', {
      server: '/api/wiki/summary?title=' + encodeURIComponent(title),
      direct: 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')),
      parse: Parsers.parseWikiSummary, ttl: 24 * 3600e3, persist: true, key: 'wk:' + title,
    });
    if (!r.ok) { dlg.innerHTML = `<div class="dlg">${unavailableBox('Profil ' + title, r)}<div class="dlg-foot"><button type="button" class="btn" data-close>Tutup</button></div></div>`; return; }
    const p = r.data;
    const holdings = STOCKS.filter(i => p.extract.toLowerCase().includes(i.name.toLowerCase().split(' ')[0].toLowerCase()) && i.name.split(' ')[0].length > 4);
    dlg.innerHTML = `<div class="dlg">
      <div class="lp-head"><h2>${esc(p.title)}</h2><button type="button" class="icon-btn sm" data-close aria-label="Tutup">×</button></div>
      <p class="lead">${esc(p.description || '')}</p>
      <p style="color:var(--ink-2);text-wrap:pretty">${esc(p.extract)}</p>
      <p class="src-line">${qBadge('historical')} Sumber: <a href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA) · revisi ${esc(p.updated ? fmtDate(p.updated) : '–')}</p>
      ${holdings.length ? `<div class="pillset">${holdings.map(i => `<button type="button" class="mini-btn" data-pick="${i.sym}">${esc(i.sym)} · ${esc(i.name)}</button>`).join('')}</div>` : ''}
      <h3>Berita terbaru yang menyebut nama ini</h3><div id="personNews"><p class="loading">GDELT</p></div>
      <p class="disclaimer">Hanya informasi peran publik dari sumber publik. Transaksi insider resmi (Form 4) tersedia di panel perusahaan untuk saham AS bila server memakai kunci Finnhub. Tidak ada data pribadi.</p>
      <div class="dlg-foot"><button type="button" class="btn" data-close>Tutup</button></div></div>`;
    dlg.querySelector('.pillset')?.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { dlg.close(); bus.emit('pickSym', { sym: b.dataset.pick, go: true }); } });
    const query = `"${p.title.replace(/\s*\(.*?\)\s*/g, '')}" sourcelang:english`;
    const n = await getData('gdelt', {
      server: '/api/gdelt/doc?' + new URLSearchParams({ query, mode: 'artlist', timespan: '7d', maxrecords: '20', sort: 'DateDesc' }),
      direct: 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({ query, mode: 'artlist', format: 'json', timespan: '7d', maxrecords: '20', sort: 'DateDesc' }),
      parse: Parsers.parseGdeltArticles, ttl: 30 * 60e3, persist: true, key: 'gdp:' + p.title,
    });
    const box = $('#personNews'); if (!box) return;
    box.innerHTML = n.ok ? `<div class="list">${n.data.slice(0, 8).map(a => `<div><a class="item-title" href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a><div class="item-meta"><span>${esc(a.domain)}</span><span>${esc(fmtAge(a.seen))}</span></div></div>`).join('') || '<p class="hint">Tidak ada berita 7 hari terakhir.</p>'}</div>` : unavailableBox('Berita', n);
  }
  return { search, open };
})();

const Palette = (() => {
  const dlg = $('#cmdk'), input = $('#cmdkInput'), list = $('#cmdkList');
  let items = [], idx = 0, seq = 0;

  function score(hay, q) {
    hay = hay.toLowerCase(); q = q.toLowerCase();
    if (hay === q) return 100;
    if (hay.startsWith(q)) return 80;
    if (hay.includes(' ' + q)) return 60;
    if (hay.includes(q)) return 40;
    return 0;
  }
  function findCountry(tok) {
    const t = tok.toUpperCase();
    return C3.get(t) || C2.get(t) || COUNTRIES.find(c => c.en.toUpperCase() === t || c.name.toUpperCase() === t) || null;
  }
  function build(raw) {
    const q = raw.trim();
    const out = [];
    const up = q.toUpperCase();
    const toks = up.split(/\s+/).filter(Boolean);
    const add = (group, code, desc, kind, run, s = 50) => out.push({ group, code, desc, kind, run, s });
    if (!q) {
      COMMANDS.forEach(([c, d, f]) => add('Perintah', c, d, 'buka', f || (() => input.value = 'HELP')));
      return out;
    }
    /* perintah berbentuk "X Y" */
    const head = CMD_ALIAS[toks[0]] || toks[0];
    if (head === 'HELP') {
      [['AAPL', 'Pilih saham/aset dan buka grafik'], ['AAPL NEWS', 'Berita tentang aset'], ['AAPL FA', 'Fundamental, insider, earnings (saham AS + Finnhub)'], ['ID ECON', 'Ekonomi negara (pakai kode ISO atau nama)'], ['ID NEWS', 'Berita dan spekulasi suatu negara'], ['COMPARE ID US CN', 'Bandingkan negara'], ['SHIP HORMUZ', 'Lompat ke selat'], ['N RUPIAH', 'Cari berita'], ['US10Y · OIL · REGIME · CB', 'Makro'], ['Jensen Huang', 'Profil tokoh publik (Wikipedia)']]
        .forEach(([c, d]) => add('Bantuan', c, d, 'contoh', () => { input.value = c.split(' · ')[0]; render(); }));
      return out;
    }
    if (head === 'COMPARE' && toks.length > 1) {
      const cs = toks.slice(1).map(findCountry).filter(Boolean);
      if (cs.length) add('Perintah', 'COMPARE', 'Bandingkan ' + cs.map(c => c.name).join(', '), 'negara', () => { CountryPage.compare(cs.map(c => c.iso3)); App.showPage('country'); }, 100);
    }
    if (head === 'SHIP' && toks.length > 1) add('Perintah', q, 'Lompat ke ' + toks.slice(1).join(' ') + ' di peta kapal', 'kapal', () => { App.showPage('ships'); ShipsPage.jump(toks.slice(1).join(' ')); }, 100);
    if (head === 'NEWS' && toks.length > 1) add('Perintah', q, 'Cari berita: ' + q.split(/\s+/).slice(1).join(' '), 'berita', () => { App.showPage('news'); NewsPage.search(q.split(/\s+/).slice(1).join(' '), 'all'); }, 100);
    const cmd = COMMANDS.find(c => c[0] === head);
    if (cmd && toks.length === 1 && cmd[2]) add('Perintah', cmd[0], cmd[1], 'buka', cmd[2], 95);
    if (['HORMUZ', 'SUEZ', 'MALAKA', 'MALACCA', 'PANAMA', 'BOSPORUS', 'SUNDA', 'LOMBOK', 'DOVER', 'TAIWAN', 'BALTIK'].includes(toks[0])) add('Perintah', toks[0], 'Lompat ke ' + toks[0].toLowerCase() + ' di peta kapal', 'kapal', () => { App.showPage('ships'); ShipsPage.jump(toks[0] === 'MALACCA' ? 'Malaka' : toks[0]); }, 96);

    /* aset */
    for (const i of INSTS) {
      const s = Math.max(score(i.sym, toks[0]) * 1.2, score(i.name, q));
      if (!s) continue;
      const sub = toks[1];
      if (sub === 'NEWS' || sub === 'N') add('Aset', i.sym + ' NEWS', 'Berita tentang ' + i.name, 'berita', () => { App.showPage('news'); NewsPage.search(i.name.split(' ')[0], i.type === 'crypto' ? 'crypto' : 'companies'); }, s + 20);
      else if (['FA', 'DES', 'HOLDERS', 'INSIDERS', 'EARNINGS', 'OPTIONS'].includes(sub)) add('Aset', i.sym + ' ' + sub, (sub === 'OPTIONS' ? 'Opsi: tidak tersedia dari sumber gratis · ' : 'Intelijen perusahaan · ') + i.name, 'perusahaan', () => { bus.emit('pickSym', { sym: i.sym, go: true }); bus.emit('companyTab', sub === 'INSIDERS' || sub === 'HOLDERS' ? 'insider' : sub === 'EARNINGS' ? 'earnings' : 'fund'); }, s + 20);
      else add('Aset', i.sym, i.name + (i.cur ? ' · ' + i.cur : '') + ' · ' + (QUALITY[i.quality] ? QUALITY[i.quality][0] : ''), i.type === 'index' ? 'indeks' : i.type === 'crypto' ? 'kripto' : 'saham', () => bus.emit('pickSym', { sym: i.sym, go: true }), s);
    }
    /* negara */
    for (const c of COUNTRIES) {
      const s = Math.max(score(c.iso3, toks[0]) * (toks[0].length === 3 ? 1.1 : 0.5), score(c.iso2, toks[0]) * (toks[0].length === 2 ? 1.05 : 0), score(c.name, q), score(c.en, q), score(c.capital, q) * 0.6);
      if (s < 40) continue;
      const sub = toks[toks.length - 1];
      const tab = ['NEWS', 'N', 'BERITA'].includes(sub) && toks.length > 1 ? 'news' : 'overview';
      add('Negara', c.iso2 + (tab === 'news' ? ' NEWS' : ' ECON'), c.name + ' · ' + (tab === 'news' ? 'berita dan spekulasi' : 'kondisi ekonomi') + (c.cur ? ' · ' + c.cur : ''), 'negara', () => { CountryPage.open(c.iso3, tab); App.showPage('country'); }, s + (tab === 'news' ? 10 : 0));
      if (s >= 80 && tab === 'overview') add('Negara', c.iso2 + ' GLOBE', c.name + ' di globe 3D', 'globe', () => { App.showPage('intel'); IntelPage.focusCountry(c.iso3); }, s - 5);
    }
    /* bank sentral, komoditas, chokepoint, indikator */
    for (const [k, nm] of Object.entries(CENTRAL_BANKS)) { const s = score(nm, q); if (s >= 40) add('Bank sentral', k, nm, 'bank sentral', () => { App.showPage('macro'); setTimeout(() => $('.cb-card').scrollIntoView({ block: 'start' }), 50); }, s); }
    for (const [id, nm] of FRED_SETS.cmdty) { const s = score(nm, q); if (s >= 40) add('Komoditas', id, nm, 'FRED', () => { App.showPage('macro'); setTimeout(() => $('.cmdty-card').scrollIntoView(), 50); }, s); }
    for (const c of CHOKE_REF) { const s = Math.max(score(c[1], q), score(c[2], q)); if (s >= 40) add('Chokepoint', c[2].toUpperCase(), c[1], 'kapal', () => { App.showPage('ships'); ShipsPage.jump(c[2]); }, s); }
    for (const m of MACRO) { const s = score(m.label, q); if (s >= 40) add('Indikator', m.short, m.label + ' semua negara di globe', 'ekonomi', () => { Store.set('intelMetric', m.key); App.showPage('intel'); }, s); }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, 40);
  }
  function render() {
    items = build(input.value);
    idx = 0;
    paint();
    const q = input.value.trim();
    const my = ++seq;
    /* tokoh publik: cari Wikipedia bila input terlihat seperti nama (2+ kata, bukan perintah) */
    if (q.length >= 5 && /\s/.test(q) && !/^(COMPARE|SHIP|NEWS|N|HELP)\b/i.test(q) && !items.some(i => i.s >= 95)) {
      clearTimeout(render._t);
      render._t = setTimeout(async () => {
        const r = await People.search(q);
        if (my !== seq || !r.ok) return;
        r.data.slice(0, 5).forEach(p => items.push({ group: 'Tokoh dan entitas (Wikipedia)', code: 'WIKI', desc: p.title + (p.snippet ? ' · ' + p.snippet.slice(0, 80) : ''), kind: 'profil', run: () => People.open(p.title), s: 10 }));
        paint();
      }, 450);
    }
  }
  function paint() {
    let html = '', g = null;
    items.forEach((it, i) => {
      if (it.group !== g) { g = it.group; html += `<div class="cmdk-group">${esc(g)}</div>`; }
      html += `<button type="button" class="cmdk-item" role="option" data-i="${i}" aria-selected="${i === idx}"><span class="code">${esc(it.code)}</span><span class="desc">${esc(it.desc)}</span><span class="kind">${esc(it.kind)}</span></button>`;
    });
    list.innerHTML = html || `<p class="hint" style="padding:10px">Tidak ada hasil. Coba kode (AAPL), negara (Indonesia), atau ketik HELP.</p>`;
  }
  function run(i) {
    const it = items[i]; if (!it) return;
    if (it.run && it.group !== 'Bantuan') dlg.close();
    it.run && it.run();
  }
  function open(prefill) { input.value = prefill || ''; render(); if (!dlg.open) dlg.showModal(); input.focus(); }
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); paint(); list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); paint(); list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); run(idx); }
  });
  list.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) run(+b.dataset.i); });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); dlg.open ? dlg.close() : open(); }
  });
  $('#btnCmd').addEventListener('click', () => open());
  return { open };
})();
