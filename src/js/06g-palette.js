/* =====================================================================
   BILAH PERINTAH (header, Ctrl+K) + PROFIL TOKOH PUBLIK (Wikipedia)
   Contoh: AAPL GP · AAPL FA · ID ECON · COMPARE ID US CN · WATCH AAPL
           ALERT AAPL > 300 · US10Y · SHIP HORMUZ · N RUPIAH · Jensen Huang
   ===================================================================== */
/* ---------- profil tokoh publik (Wikipedia + berita GDELT) ---------- */
const People = (() => {
  let openSeq = 0;
  async function search(q) {
    return getData('wikipedia', {
      server: '/api/wiki/search?q=' + encodeURIComponent(q),
      direct: `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=6&format=json&origin=*`,
      parse: Parsers.parseWikiSearch, ttl: 24 * 3600e3, persist: true, key: 'wks:' + q.toLowerCase(),
    });
  }
  async function open(title) {
    const my = ++openSeq;                       // profil yang dibuka paling akhir yang menang
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
    if (my !== openSeq) return;
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
      parse: Parsers.parseGdeltArticles, ttl: 30 * 60e3, persist: true, key: 'gdp:' + p.title, alive: () => my === openSeq,
    });
    if (my !== openSeq) return;
    const box = dlg.querySelector('#personNews'); if (!box) return;
    box.innerHTML = n.ok ? `<div class="list">${n.data.slice(0, 8).map(a => `<div><a class="item-title" href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a><div class="item-meta"><span>${esc(a.domain)}</span><span>${esc(fmtAge(a.seen))}</span></div></div>`).join('') || '<p class="hint">Tidak ada berita 7 hari terakhir.</p>'}</div>` : unavailableBox('Berita', n);
  }
  return { search, open };
})();

/* =====================================================================
   BILAH PERINTAH (header): pencarian global + perintah terminal dengan autocomplete.
   Mesin parse/suggest ada di shared/commands.mjs (diuji di Node); di sini hanya UI.
   - Ctrl+K atau / : fokus ke bilah. Panah atas/bawah: pilih saran. Enter: jalankan.
   - Panah atas di bilah kosong: riwayat perintah. Esc: tutup daftar.
   - Teks yang bukan perintah dicari di Wikipedia (tokoh/perusahaan) sebagai saran.
   ===================================================================== */
const CommandBar = (() => {
  const input = $('#cmdInput'), drop = $('#cmdDrop'), wrap = $('#cmdBar');
  let items = [], idx = -1, seq = 0, histPos = -1, msg = null;
  const KIND = { entity: 'aset', verb: 'perintah', command: 'perintah', arg: 'pilihan', history: 'riwayat', wiki: 'Wikipedia' };
  function setOpen(on) { drop.hidden = !on; input.setAttribute('aria-expanded', String(on)); }
  function paint() {
    const parts = [];
    if (msg) parts.push(`<div class="cmd-msg ${msg.ok ? 'ok' : 'err'}" role="${msg.ok ? 'status' : 'alert'}">${esc(msg.text)}</div>`);
    let g = null;
    items.forEach((it, i) => {
      const grp = it.group || KIND[it.kind] || '';
      if (grp !== g) { g = grp; parts.push(`<div class="cmdk-group">${esc(g)}</div>`); }
      parts.push(`<button type="button" class="cmdk-item" role="option" id="cmdOpt${i}" data-i="${i}" aria-selected="${i === idx}"><span class="code">${esc(it.label)}</span><span class="desc">${esc(it.detail || '')}</span><span class="kind">${esc(KIND[it.kind] || it.kind)}</span></button>`);
    });
    drop.innerHTML = parts.join('') || '<p class="hint" style="padding:8px 10px">Ketik kode (AAPL), perintah (AAPL GP, ID ECON, WATCH AAPL) atau HELP.</p>';
    input.setAttribute('aria-activedescendant', idx >= 0 ? 'cmdOpt' + idx : '');
    setOpen(true);
  }
  function suggest() {
    const v = input.value;
    msg = null; idx = -1; histPos = -1;
    if (!v.trim()) {
      const h = Terminal.history().slice(0, 6).map(x => ({ kind: 'history', label: x, detail: '', insert: x, group: 'Riwayat' }));
      items = [...h, ...Commands.suggest('', REG, { limit: 10 }).map(s => ({ ...s, group: 'Perintah' }))];
    } else items = Commands.suggest(v, REG, { limit: 14 }).map(s => ({ ...s, group: s.kind === 'entity' ? (REG.types[s.type] || 'Aset') : undefined }));
    paint();
    /* teks bebas yang tidak cocok apa pun: cari tokoh/perusahaan di Wikipedia */
    const q = v.trim(), my = ++seq;
    clearTimeout(suggest._t);
    if (q.length >= 4 && /\s/.test(q) && !Commands.parse(q, REG).ok && !items.some(i => i.kind === 'verb')) {
      suggest._t = setTimeout(async () => {
        const r = await People.search(q);
        if (my !== seq || !r.ok) return;
        items.push(...r.data.slice(0, 5).map(p => ({ kind: 'wiki', label: p.title, detail: (p.snippet || '').slice(0, 90), group: 'Tokoh dan entitas (Wikipedia)', wiki: p.title })));
        paint();
      }, 450);
    }
  }
  function show(text, ok) { msg = { text, ok }; items = ok ? [] : items; paint(); }
  function execute(text) {
    const r = Terminal.run(text);
    if (r.ok) {
      input.value = '';
      if (r.message) { show(r.message, true); setTimeout(() => { if (msg && msg.ok) { msg = null; setOpen(false); } }, 3500); }
      else { setOpen(false); input.blur(); }
      return true;
    }
    /* gagal: tampilkan pesan dan saran yang bisa dipilih */
    const sug = (r.parsed && r.parsed.suggestions) || [];
    items = sug.slice(0, 6).map(e => ({ kind: 'entity', label: e.symbol || e.name, detail: e.name + ' · ' + (REG.types[e.type] || e.type), insert: e.symbol || e.name, group: 'Mungkin maksudmu' }));
    show(r.message || 'Perintah tidak dikenal', false);
    return false;
  }
  function choose(i) {
    const it = items[i]; if (!it) return;
    if (it.kind === 'wiki') { setOpen(false); People.open(it.wiki); return; }
    if (it.incomplete) { input.value = it.insert; input.focus(); suggest(); return; }
    input.value = it.insert;
    execute(it.insert);
  }
  input.addEventListener('input', suggest);
  input.addEventListener('focus', () => { suggest(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (drop.hidden) suggest(); idx = Math.min(idx + 1, items.length - 1); paint(); drop.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = Terminal.history();
      if ((!input.value.trim() || histPos >= 0) && idx < 0 && h.length) { histPos = Math.min(histPos + 1, h.length - 1); input.value = h[histPos]; return; }
      idx = Math.max(idx - 1, -1); paint();
    }
    else if (e.key === 'Tab' && idx >= 0 && items[idx] && items[idx].insert) { e.preventDefault(); input.value = items[idx].insert; suggest(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (idx >= 0) choose(idx); else if (input.value.trim()) execute(input.value); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); input.blur(); }
  });
  drop.addEventListener('mousedown', e => e.preventDefault());       // jangan hilangkan fokus input saat klik saran
  drop.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); focus(); }
  });
  function focus(prefill) { if (prefill !== undefined) input.value = prefill; input.focus(); suggest(); }
  $('#btnCmd').addEventListener('click', () => focus());
  return { focus, fill: text => focus(text), run: execute };
})();
