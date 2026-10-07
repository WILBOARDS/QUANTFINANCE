/* =====================================================================
   PUSAT SUMBER DATA + KESEHATAN DATA
   Menampilkan status setiap penyedia: tersambung / menurun / gagal,
   latensi, update terakhir, jumlah permintaan, cache, error terakhir, cadangan.
   ===================================================================== */
const SourcesPage = (() => {
  let built = false, srvProviders = null, tmr = null, tmr2 = null;
  const STATUS = { ok: ['Tersambung', 'up'], degraded: ['Menurun', ''], down: ['Gagal', 'down'], idle: ['Belum dipakai', ''], unconfigured: ['Belum dikonfigurasi', ''] };
  const dot = s => `<span class="st-dot" data-s="${esc(s)}"></span>`;

  function serverBox() {
    const el = $('#srvBody');
    if (Net.server) {
      const h = Net.server.health;
      el.innerHTML = `<p class="lead">${dot('ok')} <b>Server lokal tersambung</b> di <code>${esc(Net.server.base)}</code> · versi ${esc(h.version)} · jam server ${esc(fmtTime(h.time))}</p>
        <dl class="kv three">${Object.entries(h.keys).map(([k, v]) => `<div><dt>Kunci ${esc(k)}</dt><dd class="${v ? 'up' : ''}" style="font-family:var(--font-ui);font-size:12px">${v ? 'terpasang' : 'belum diisi'}</dd></div>`).join('')}
        <div><dt>Yahoo tidak resmi</dt><dd style="font-family:var(--font-ui);font-size:12px">${h.yahoo ? 'AKTIF' : 'mati'}</dd></div></dl>
        <p class="hint">Nilai kunci tidak pernah dikirim ke browser; server hanya memberi tahu ada atau tidak.</p>`;
    } else {
      el.innerHTML = `<p class="lead">${dot('down')} <b>Server lokal tidak terdeteksi.</b> Aplikasi tetap jalan memakai sumber tanpa kunci yang mengizinkan akses langsung dari browser (World Bank, kripto, gempa USGS, kurs). Beberapa sumber hanya bisa lewat server: FRED, BIS, GDACS, kapal global (AISStream), saham (Finnhub).</p>
        <ol class="chain"><li>Pasang Node.js versi 22 atau lebih baru (nodejs.org, pilih LTS).</li><li>Di folder proyek: <code>npm ci</code> lalu <code>npm run build</code>.</li><li>Salin <code>.env.example</code> menjadi <code>.env</code>, isi kunci yang kamu punya (boleh kosong).</li><li>Jalankan <code>npm start</code>, lalu buka <code>http://localhost:8787</code>.</li></ol>` +
        (location.protocol === 'file:' ? `<p class="hint"><b>Halaman ini dibuka sebagai file.</b> Demi keamanan, server tidak melayani halaman file:// (situs lain bisa menyamar dengan asal yang sama, "null"). Kalau server sudah jalan, buka <a href="http://localhost:8787" target="_blank" rel="noopener noreferrer">http://localhost:8787</a>. Bila tetap ingin file://, set <code>ALLOW_FILE_ORIGIN=1</code> di .env dan pahami risikonya.</p>` : '');
    }
  }
  function merged() {
    const rows = [];
    for (const [id, d] of Object.entries(SOURCE_DEFS)) {
      const c = SourceState[id] || {};
      const sv = srvProviders && srvProviders.find(p => p.id === id || (id === 'ais' && p.id === 'aisstream') || (id === 'fx' && p.id === 'fx'));
      let status = c.status || 'idle';
      if (sv && sv.status !== 'idle' && (status === 'idle' || (sv.lastOk && (!c.lastOk || sv.lastOk > c.lastOk)))) status = sv.status;
      if (!Net.server && !d.direct) status = 'unconfigured';
      rows.push({
        id, name: d.name, kind: d.kind, auth: d.auth, limit: (sv && sv.limit) || d.limit, home: d.home, fallback: d.fallback,
        status, latency: c.latency ?? (sv && sv.latencyMs), lastOk: [c.lastOk, sv && sv.lastOk].filter(Boolean).sort().pop() || null,
        requests: (c.requests || 0), srvRequests: sv ? sv.dayRequests : null, cache: (c.cacheHits || 0) + (sv ? sv.cacheHits : 0), via: c.via || (sv ? 'server' : '–'),
        err: c.lastErrMsg || (sv && sv.lastErrorMsg) || '', errAt: [c.lastErr, sv && sv.lastError].filter(Boolean).sort().pop() || null,
        backoff: sv && sv.backoffUntil, configured: sv ? sv.configured !== false : true,
      });
    }
    return rows;
  }
  function providers() {
    const rows = merged();
    const okN = rows.filter(r => r.status === 'ok').length;
    $('#provMeta').textContent = `${okN} tersambung dari ${rows.length}`;
    $('#provBody').innerHTML = `<table class="dense static"><thead><tr><th>Penyedia</th><th>Jenis</th><th>Status</th><th>Jalur</th><th class="num">Latensi</th><th>Update terakhir</th><th class="num">Permintaan (browser)</th><th class="num">Hari ini (server)</th><th class="num">Cache</th><th>Batas</th><th>Autentikasi</th><th>Cadangan</th><th>Error terakhir</th></tr></thead><tbody>` +
      rows.map(r => { const [lbl, cls] = STATUS[r.status] || [r.status, '']; return `<tr><td><a href="${safeUrl(r.home)}" target="_blank" rel="noopener">${esc(r.name)}</a></td><td>${esc(r.kind)}</td><td class="${cls}">${dot(r.status)} ${esc(lbl)}${r.backoff ? ' · dibatasi' : ''}</td><td>${esc(r.via)}</td>
        <td class="num">${r.latency ? fmt(r.latency, 0) + ' ms' : '–'}</td><td>${esc(r.lastOk ? fmtAge(r.lastOk) : '–')}</td><td class="num">${r.requests}</td><td class="num">${r.srvRequests ?? '–'}</td><td class="num">${r.cache}</td>
        <td style="white-space:normal;min-width:140px">${esc(r.limit || '–')}</td><td>${esc(r.auth)}</td><td>${esc(r.fallback ? (SOURCE_DEFS[r.fallback] || {}).name || r.fallback : '–')}</td>
        <td style="white-space:normal;min-width:200px" class="${r.err ? 'down' : ''}">${r.err ? esc(r.err) + (r.errAt ? ' <span class="sub">' + esc(fmtAge(r.errAt)) + '</span>' : '') : '–'}</td></tr>`; }).join('') + `</tbody></table>`;
  }
  /* kesehatan kumpulan data: apa yang sudah dimuat, seberapa segar, apa yang hilang */
  function health() {
    const rows = [];
    const add = (name, res, freshMs, note) => {
      if (!res) { rows.push([name, 'belum dimuat', '–', '', note || '']); return; }
      if (!res.ok) { rows.push([name, 'gagal', '–', 'down', res.error || '']); return; }
      const age = Date.now() - Date.parse(res.fetchedAt);
      const st = res.stale ? 'basi (sumber gagal, memakai salinan lama)' : age > freshMs ? 'perlu disegarkan' : 'segar';
      rows.push([name, st, fmtAge(res.fetchedAt), res.stale ? 'down' : age > freshMs ? '' : 'up', note || '']);
    };
    for (const ind of [...MACRO, ...WB_BULK]) {
      const m = CountryData.meta[ind.key];
      const n = Object.values(CountryData.store).filter(x => x[ind.key]).length;
      add('Negara: ' + ind.label, m, 24 * 3600e3, m && m.ok !== false ? `${n} negara · ${m.sourceName || ''}` : '');
    }
    add('Chokepoint (PortWatch)', ShipData.st.choke, 24 * 3600e3);
    add('Kapal AIS', ShipData.st.ships, 60e3, ShipData.st.ships && ShipData.st.ships.ok ? `${(ShipData.st.ships.vessels || []).length} kapal` : '');
    const crypto = STOCKS.filter(i => i.type === 'crypto');
    const real = INSTS.filter(i => i.real);
    rows.push(['Harga aset', `${real.length} dari ${INSTS.length} nyata`, real.length ? fmtAge(real.map(i => i.asOf).sort().pop()) : '–', real.length ? 'up' : '', `kripto: ${crypto.filter(i => i.real).length}/${crypto.length}; tanpa sumber: ${INSTS.filter(i => !i.real).map(i => i.sym).slice(0, 12).join(', ')}${INSTS.filter(i => !i.real).length > 12 ? '…' : ''}`]);
    const stale = INSTS.filter(i => i.real && i.asOf && Date.now() - Date.parse(i.asOf) > 3 * 86400e3 && i.type !== 'index');
    if (stale.length) rows.push(['Harga basi', stale.length + ' aset', '', 'down', stale.map(i => i.sym).join(', ')]);
    $('#healthData').innerHTML = `<table class="dense static"><thead><tr><th>Kumpulan data</th><th>Status</th><th>Diambil</th><th>Catatan</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="${r[3]}">${esc(r[1])}</td><td>${esc(r[2])}</td><td style="white-space:normal">${esc(r[4])}</td></tr>`).join('')}</tbody></table>`;
  }
  async function refreshServer() {
    if (!Net.server) { srvProviders = null; return; }
    try { const r = await Net.fetch(Net.server.base + '/api/providers', { timeout: 4000 }); srvProviders = r.providers; } catch { srvProviders = null; }
  }
  /* log error internal: semua kegagalan jaringan, penyedia, parser, tampilan, perintah */
  function errLog() {
    const L = ErrorLog.list();
    $('#errLogMeta').textContent = L.length ? `${ErrorLog.count()} kejadian, ${L.length} jenis pesan (di memori browser ini saja)` : 'belum ada kejadian';
    $('#errLog').innerHTML = L.length ? `<table class="dense"><thead><tr><th>Waktu</th><th>Jenis</th><th class="num">Kali</th><th>Pesan</th></tr></thead><tbody>${L.map(e => `<tr><td class="num">${esc(fmtTime(e.lastAt))}</td><td>${esc(ErrorLog.KINDS[e.kind] || e.kind)}</td><td class="num">${e.count}</td><td class="wrap">${esc(e.message)}${e.detail ? `<span class="sub">${esc(e.detail.split('\n')[0])}</span>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<p class="hint" style="padding:12px 14px">Tidak ada error tercatat sejak halaman dibuka.</p>';
  }
  function render() { serverBox(); providers(); health(); errLog(); }
  return {
    async show() {
      await Net.ready();
      if (!built) {
        bus.on('server', () => { if (!$('#page-sources').hidden) refreshServer().then(render); });
        built = true;
        $('#srvRetry').addEventListener('click', async () => { await Net.detect(); await refreshServer(); render(); });
        $('#provExport').addEventListener('click', () => download('sumber-data.json', JSON.stringify({ exportedAt: new Date().toISOString(), server: Net.server ? Net.server.base : null, providers: merged() }, null, 2), 'application/json'));
        bus.on('sources', () => { if (!$('#page-sources').hidden) { clearTimeout(tmr); tmr = setTimeout(() => { providers(); health(); }, 400); } });
        bus.on('errorlog', () => { if (!$('#page-sources').hidden) { clearTimeout(tmr2); tmr2 = setTimeout(errLog, 300); } });
        $('#errLogClear').addEventListener('click', () => { ErrorLog.clear(); errLog(); });
        $('#errLogExport').addEventListener('click', () => download('log-error.json', JSON.stringify({ exportedAt: new Date().toISOString(), entries: ErrorLog.list() }, null, 2), 'application/json'));
      }
      await refreshServer();
      render();
    },
  };
})();
