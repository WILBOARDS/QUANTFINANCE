/* =====================================================================
   TOKOH & PERUSAHAAN (perintah: PEOPLE Jensen Huang, NVDA PEOPLE)
   - Fakta peran publik dari Wikidata (CC0) lewat server (/api/wikidata/*) atau langsung
     (Wikidata mendukung CORS), plus ringkasan Wikipedia (CC BY-SA) dengan tanggal revisi.
   - Privasi: shared/wikidata.mjs hanya membaca properti ALLOW dan selalu membuang BLOCK
     (tanggal/tempat lahir, keluarga, alamat, telepon, email, foto, agama, dll.). Tanpa gambar.
   - Setiap fakta: tautan item Wikidata + nomor properti (mis. P108), dan kualifier mulai/selesai.
   - Data Wikidata disunting komunitas: bisa tidak mutakhir; ditulis di halaman.
   ===================================================================== */
SOURCE_DEFS.wikidata = { name: 'Wikidata', kind: 'Profil tokoh & perusahaan', direct: true, server: true, auth: 'tanpa kunci', quality: 'historical', home: 'https://www.wikidata.org/wiki/Wikidata:Data_access', limit: 'API publik; di-cache 24 jam' };
if (!SourceState.wikidata) SourceState.wikidata = { status: 'idle', requests: 0, cacheHits: 0, errors: 0, latency: null, lastOk: null, lastErr: null, lastErrMsg: '', via: null };

const PeoplePage = (() => {
  const W = Wikidata;
  const API = 'https://www.wikidata.org/w/api.php';
  const S = { seq: 0, built: false, cur: null };
  const qUrl = id => 'https://www.wikidata.org/wiki/' + id;
  const pUrl = pid => 'https://www.wikidata.org/wiki/Property:' + pid;

  const search = (q, alive) => getData('wikidata', {
    server: '/api/wikidata/search?q=' + encodeURIComponent(q),
    direct: `${API}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&uselang=en&type=item&limit=7&format=json&origin=*`,
    parse: W.parseSearch, ttl: 24 * 3600e3, persist: true, key: 'wds:' + q.toLowerCase(), alive,
  });
  const entities = (ids, alive) => {
    const list = [...new Set(ids)].sort().join('|');
    return getData('wikidata', {
      server: '/api/wikidata/entities?ids=' + list,
      direct: `${API}?action=wbgetentities&ids=${list}&props=labels|descriptions|claims|sitelinks|info&languages=id|en&format=json&origin=*`,
      parse: raw => Object.values((raw && raw.entities) || {}).filter(e => e && !e.missing && W.QID_RE.test(e.id || '')).map(e => W.parseEntity(e)),
      ttl: 24 * 3600e3, persist: true, key: 'wde:' + list, alive,
    });
  };
  const labels = (ids, alive) => {
    if (!ids.length) return Promise.resolve({ ok: true, data: {} });
    const list = [...new Set(ids)].sort().slice(0, 50).join('|');
    return getData('wikidata', {
      server: '/api/wikidata/labels?ids=' + list,
      direct: `${API}?action=wbgetentities&ids=${list}&props=labels&languages=id|en&format=json&origin=*`,
      parse: W.parseLabels, ttl: 7 * 86400e3, persist: true, key: 'wdl:' + list, alive,
    });
  };

  /* ---------- tampilan fakta ---------- */
  function factHtml(f, lab, r) {
    const v = f.value;
    const name = v.qid ? (lab[v.qid] || v.qid) : v.url ? v.url : v.text !== undefined ? v.text : v.num !== undefined ? fmt(v.num, 0) : '–';
    const q = f.qualifiers, parts = [];
    if (q.jabatan) parts.push('sebagai ' + (lab[q.jabatan.qid] || q.jabatan.qid));
    if (q.bursa) parts.push('di ' + (lab[q.bursa.qid] || q.bursa.qid));
    if (q.mulai || q.selesai) parts.push((q.mulai ? q.mulai.text : '?') + ' – ' + (q.selesai ? q.selesai.text : 'sekarang (menurut Wikidata)'));
    if (q.per) parts.push('per ' + q.per.text);
    const lin = Lineage.wrap({ label: f.prop, value: name + (parts.length ? ' (' + parts.join(', ') + ')' : ''), quality: 'historical', source: `Wikidata ${r.qid} · ${f.pid}`, home: qUrl(r.qid), url: pUrl(f.pid), asOf: r.modified, fetchedAt: S.cur && S.cur.fetchedAt, note: 'Pernyataan Wikidata (disunting komunitas, CC0); bisa tidak mutakhir. Peringkat: ' + f.rank }, esc(name));
    const link = v.url ? `<a href="${safeUrl(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.url.replace(/^https?:\/\//, '').slice(0, 50))}</a>` : v.qid ? `${lin} <a class="wd-q" href="${safeUrl(qUrl(v.qid))}" target="_blank" rel="noopener noreferrer" title="Item Wikidata ${esc(v.qid)}">${esc(v.qid)}</a>` : lin;
    return `<li${q.selesai ? ' class="wd-past"' : ''}>${link}${parts.length ? ` <span class="meta">${esc(parts.join(' · '))}</span>` : ''}</li>`;
  }
  function groupHtml(r, lab, pids) {
    return pids.map(pid => {
      const fs = r.facts.filter(f => f.pid === pid);
      if (!fs.length) return '';
      return `<div class="wd-g"><h3>${esc(W.ALLOW[pid][0])} <a class="wd-p" href="${safeUrl(pUrl(pid))}" target="_blank" rel="noopener noreferrer">${esc(pid)}</a></h3><ul>${fs.map(f => factHtml(f, lab, r)).join('')}</ul></div>`;
    }).join('');
  }
  async function wikiSummary(title, box, alive) {
    if (!title) { box.innerHTML = '<p class="hint">Tidak ada artikel Wikipedia bahasa Inggris yang tertaut.</p>'; return; }
    const r = await getData('wikipedia', {
      server: '/api/wiki/summary?title=' + encodeURIComponent(title),
      direct: 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')),
      parse: Parsers.parseWikiSummary, ttl: 24 * 3600e3, persist: true, key: 'wk:' + title,
    });
    if (!alive() || !box.isConnected) return;
    box.innerHTML = r.ok ? `<p class="wd-sum">${esc(r.data.extract)}</p><p class="src-line">${qBadge('historical')} Sumber: <a href="${safeUrl(r.data.url)}" target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA) · revisi ${esc(r.data.updated ? fmtDate(r.data.updated) : '–')}</p>`
      : unavailableBox('Ringkasan Wikipedia', r);
  }

  function profileHtml(r, lab, kind, note) {
    const human = W.isHuman(r);
    const pids = human ? W.PERSON_ROLES : kind === 'company' ? [...W.COMPANY_ROLES, 'P249', 'P414', 'P452', 'P159', 'P17', 'P571', 'P1128', 'P856'] : Object.keys(W.ALLOW).filter(p => p !== 'P31');
    const body = groupHtml(r, lab, pids);
    return `<div class="wd-head"><h2>${esc(r.label || r.qid)}</h2><span class="meta">${esc(r.description || '')}</span>
        <p class="src-line">${qBadge('historical', 'data referensi disunting komunitas')} Sumber: <a href="${safeUrl(qUrl(r.qid))}" target="_blank" rel="noopener noreferrer">Wikidata ${esc(r.qid)}</a> (CC0) · diubah ${esc(r.modified ? fmtDate(r.modified) : '–')} · menurut Wikidata, bisa tidak mutakhir${note ? ' · ' + esc(note) : ''}</p></div>
      ${body || '<p class="hint">Wikidata belum memuat fakta peran publik untuk item ini.</p>'}
      <h3 class="fa-h3">Ringkasan</h3><div class="wd-wiki"><p class="loading">Wikipedia</p></div>
      <p class="disclaimer">Hanya peran publik dari sumber publik. Data pribadi (tanggal dan tempat lahir, keluarga, alamat, telepon, email, foto, agama, dan sejenisnya) sengaja tidak diambil dan tidak ditampilkan.</p>`;
  }

  async function show(qid, kind, note) {
    const my = ++S.seq, alive = () => my === S.seq && !$('#page-people').hidden;
    const box = $('#pplBody');
    box.innerHTML = '<p class="loading">Mengambil Wikidata</p>';
    const r = await entities([qid], alive);
    if (!alive()) return;
    const ent = r.ok && r.data.find(x => x.qid === qid);
    if (!ent) { box.innerHTML = unavailableBox('Profil Wikidata ' + qid, r.ok ? { error: 'Item tidak ditemukan.' } : r); return; }
    S.cur = { qid, fetchedAt: r.fetchedAt };
    const lr = await labels(W.referencedQids(ent), alive);
    if (!alive()) return;
    box.innerHTML = profileHtml(ent, lr.ok ? lr.data : {}, kind, note);
    wikiSummary(ent.enwiki, box.querySelector('.wd-wiki'), alive);
  }

  /* daftar hasil cari (dipilih pengguna) */
  async function find(q) {
    const my = ++S.seq, alive = () => my === S.seq && !$('#page-people').hidden;
    $('#pplQ').value = q;
    const box = $('#pplBody'), list = $('#pplList');
    list.innerHTML = '<p class="loading">Mencari di Wikidata</p>'; box.innerHTML = '';
    const r = await search(q, alive);
    if (!alive()) return;
    if (!r.ok) { list.innerHTML = unavailableBox('Pencarian Wikidata', r); return; }
    if (!r.data.length) { list.innerHTML = `<p class="empty">Tidak ada hasil Wikidata untuk "${esc(q)}".</p>`; return; }
    list.innerHTML = `<ul class="wd-hits">${r.data.map(x => `<li><button type="button" class="link-btn" data-qid="${esc(x.qid)}">${esc(x.label)}</button> <span class="meta">${esc(x.description)} · ${esc(x.qid)}</span></li>`).join('')}</ul>`;
    show(r.data[0].qid, 'person');
  }
  /* perusahaan dari entitas aset: cari nama, cocokkan kode saham (P249) bila ada */
  async function company(e) {
    const my = ++S.seq, alive = () => my === S.seq && !$('#page-people').hidden;
    const name = String(e.name || e.symbol).replace(/\s*\(.*?\)\s*/g, ' ').replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Ltd\.?|Tbk|PLC|S\.A\.|N\.V\.|SE|AG|Co\.|Company|Holdings?)\b\.?/gi, '').trim();
    $('#pplQ').value = name;
    const list = $('#pplList'), box = $('#pplBody');
    list.innerHTML = '<p class="loading">Mencari perusahaan di Wikidata</p>'; box.innerHTML = '';
    const r = await search(name, alive);
    if (!alive()) return;
    if (!r.ok || !r.data.length) { list.innerHTML = ''; box.innerHTML = unavailableBox('Profil perusahaan ' + e.symbol, r.ok ? { error: `Tidak ada item Wikidata untuk "${name}".` } : r); return; }
    const top = r.data.slice(0, 3).map(x => x.qid);
    const ents = await entities(top, alive);
    if (!alive()) return;
    const cands = ents.ok ? ents.data : [];
    const byTicker = cands.find(c => c.facts.some(f => f.pid === 'P249' && String(f.value.text || '').toUpperCase() === String(e.symbol).toUpperCase()));
    const pick = byTicker || cands.find(c => c.facts.some(f => W.COMPANY_ROLES.includes(f.pid))) || cands[0];
    list.innerHTML = `<ul class="wd-hits">${r.data.map(x => `<li><button type="button" class="link-btn" data-qid="${esc(x.qid)}" data-kind="company">${esc(x.label)}</button> <span class="meta">${esc(x.description)} · ${esc(x.qid)}</span></li>`).join('')}</ul>`;
    if (!pick) { box.innerHTML = unavailableBox('Profil perusahaan ' + e.symbol, ents.ok ? { error: 'Item tidak bisa dibaca.' } : ents); return; }
    show(pick.qid, 'company', byTicker ? `dicocokkan lewat kode saham ${e.symbol} (P249)` : `dicocokkan lewat nama "${name}"; periksa apakah itu perusahaan yang benar`);
  }

  function build() {
    if (S.built) return;
    S.built = true;
    $('#pplForm').addEventListener('submit', ev => { ev.preventDefault(); const q = $('#pplQ').value.trim(); if (q.length >= 2) find(q); });
    $('#pplList').addEventListener('click', ev => { const b = ev.target.closest('[data-qid]'); if (b) show(b.dataset.qid, b.dataset.kind || 'person'); });
  }
  return {
    show() { build(); if (!S.seq) $('#pplBody').innerHTML = '<p class="hint">Ketik nama tokoh atau perusahaan, atau pakai perintah <kbd>PEOPLE Jensen Huang</kbd> / <kbd>NVDA PEOPLE</kbd>.</p>'; },
    hide() { S.seq++; },
    /* entity: aset/perusahaan (profil perusahaan + orang kunci) atau tokoh; query: teks bebas */
    open(entity, query) {
      build();
      /* pemanggil (bilah perintah) boleh memanggil sebelum halaman tampil; pemeriksaan alive butuh halaman terlihat */
      if ($('#page-people').hidden) { S.seq++; App.showPage('people'); }
      if (entity && ['stock', 'etf', 'company'].includes(entity.type)) { company(entity); return; }
      const q = String(query || (entity && entity.name) || '').trim();
      if (q.length >= 2) find(q);
    },
  };
})();
App.registerPage('people', PeoplePage, { group: 'riset', label: 'Tokoh', after: 'country', icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>' });
