/* =====================================================================
   LAPISAN DATA: semua permintaan ke sumber luar lewat sini.
   - Registri penyedia (status, latensi, jumlah permintaan, cache, fallback)
   - Server lokal (opsional) dideteksi otomatis; kalau ada, dipakai dulu.
   - Sumber tanpa kunci yang ramah CORS dipanggil langsung dari browser.
   - Setiap hasil membawa: sumber, waktu, kualitas (live/tertunda/harian/...).
   - Tidak pernah diam-diam jatuh ke data palsu. Data lama ditandai "Basi".
   ===================================================================== */

/* ---------- label kualitas data ---------- */
const QUALITY = {
  live: ['Live', 'Data waktu-nyata atau mendekati (detik)'],
  delayed: ['Tertunda', 'Data tertunda menit sampai hari'],
  eod: ['Harian', 'Data akhir hari (end-of-day)'],
  historical: ['Historis', 'Data tahunan/periodik dari statistik resmi'],
  projection: ['Proyeksi', 'Proyeksi resmi lembaga (mis. IMF WEO), bukan data aktual'],
  calculated: ['Kalkulasi', 'Dihitung aplikasi dari data nyata'],
  proxy: ['Proksi', 'Pendekatan tidak langsung, bukan ukuran asli'],
  inference: ['Inferensi', 'Kesimpulan analitis berbasis aturan, bukan fakta'],
  sim: ['Simulasi', 'Angka buatan generator acak, BUKAN data nyata'],
  stale: ['Basi', 'Salinan lama karena sumber gagal; periksa waktunya'],
  unofficial: ['Tidak resmi', 'Sumber tidak resmi, bisa putus kapan saja'],
  unavailable: ['Tidak tersedia', 'Sumber tidak bisa diakses atau tidak punya data ini'],
};
function qBadge(q, extraTitle) {
  const [label, desc] = QUALITY[q] || [q, ''];
  return `<span class="qb q-${esc(q)}" title="${esc(desc + (extraTitle ? '. ' + extraTitle : ''))}">${esc(label)}</span>`;
}
function fmtAge(iso, now = Date.now()) {
  if (!iso) return '–';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '–';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return s + ' dtk lalu';
  if (s < 3600) return Math.round(s / 60) + ' mnt lalu';
  if (s < 172800) return Math.round(s / 3600) + ' jam lalu';
  return Math.round(s / 86400) + ' hari lalu';
}
const _dtfShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const _dfShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
function fmtTime(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? _dtfShort.format(t) : '–'; }
function fmtDate(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? _dfShort.format(t) : '–'; }

/* ---------- registri penyedia di sisi browser ----------
   direct: boleh dipanggil langsung dari browser (tanpa kunci, ramah CORS). server: lewat server lokal. */
const SOURCE_DEFS = {
  worldbank: { name: 'World Bank WDI', kind: 'Ekonomi', direct: true, server: true, auth: 'tanpa kunci', quality: 'historical', home: 'https://data.worldbank.org', limit: 'tidak dipublikasikan', fallback: 'imf' },
  imf: { name: 'IMF DataMapper (WEO)', kind: 'Ekonomi', direct: true, server: true, auth: 'tanpa kunci', quality: 'historical', home: 'https://www.imf.org/external/datamapper', limit: 'tidak dipublikasikan', fallback: 'worldbank' },
  gdelt: { name: 'GDELT DOC/GEO 2.0', kind: 'Berita', direct: true, server: true, auth: 'tanpa kunci', quality: 'delayed', home: 'https://www.gdeltproject.org', limit: '1 permintaan / 5 detik per IP', fallback: null },
  fred: { name: 'FRED (St. Louis Fed)', kind: 'Makro AS', direct: false, server: true, auth: 'server (kunci opsional)', quality: 'eod', home: 'https://fred.stlouisfed.org', limit: '120/menit dengan kunci', fallback: null },
  portwatch: { name: 'IMF PortWatch', kind: 'Pelayaran', direct: true, server: true, auth: 'tanpa kunci', quality: 'delayed', home: 'https://portwatch.imf.org', limit: 'ArcGIS publik', fallback: null },
  ais: { name: 'AIS (AISStream + Digitraffic)', kind: 'Kapal live', direct: false, server: true, auth: 'server (AISStream butuh kunci)', quality: 'live', home: 'https://aisstream.io', limit: 'WebSocket di server', fallback: 'digitraffic' },
  digitraffic: { name: 'Digitraffic AIS (Baltik)', kind: 'Kapal live', direct: true, server: false, auth: 'tanpa kunci', quality: 'live', home: 'https://www.digitraffic.fi/en/marine-traffic/', limit: 'wajar; CC BY 4.0', fallback: null },
  usgs: { name: 'USGS Earthquakes', kind: 'Bencana', direct: true, server: true, auth: 'tanpa kunci', quality: 'live', home: 'https://earthquake.usgs.gov', limit: 'feed publik', fallback: null },
  gdacs: { name: 'GDACS', kind: 'Bencana', direct: false, server: true, auth: 'tanpa kunci (lewat server)', quality: 'delayed', home: 'https://www.gdacs.org', limit: 'feed publik', fallback: null },
  fx: { name: 'ExchangeRate-API (open)', kind: 'Kurs', direct: true, server: true, auth: 'tanpa kunci', quality: 'eod', home: 'https://www.exchangerate-api.com', limit: 'update harian', fallback: 'frankfurter' },
  bis: { name: 'BIS policy rates', kind: 'Bank sentral', direct: false, server: true, auth: 'tanpa kunci (lewat server)', quality: 'eod', home: 'https://data.bis.org/topics/CBPOL', limit: '–', fallback: null },
  binance: { name: 'Binance (publik)', kind: 'Kripto', direct: true, server: true, auth: 'tanpa kunci', quality: 'live', home: 'https://www.binance.com', limit: 'bobot 6000/menit', fallback: 'coingecko' },
  coingecko: { name: 'CoinGecko', kind: 'Kripto', direct: true, server: true, auth: 'tanpa kunci', quality: 'delayed', home: 'https://www.coingecko.com', limit: '±5–30/menit (publik)', fallback: null },
  finnhub: { name: 'Finnhub', kind: 'Saham AS', direct: false, server: true, auth: 'server (kunci)', quality: 'live', home: 'https://finnhub.io', limit: '60/menit', fallback: 'yahoo' },
  yahoo: { name: 'Yahoo Finance (tidak resmi)', kind: 'Saham global', direct: false, server: true, auth: 'server, harus diaktifkan', quality: 'unofficial', home: 'https://finance.yahoo.com', limit: 'tidak resmi', fallback: null },
  wikipedia: { name: 'Wikipedia', kind: 'Tokoh publik', direct: true, server: true, auth: 'tanpa kunci', quality: 'historical', home: 'https://www.wikipedia.org', limit: 'wajar', fallback: null },
};
const SourceState = {};
for (const id in SOURCE_DEFS) SourceState[id] = { status: 'idle', requests: 0, cacheHits: 0, errors: 0, latency: null, lastOk: null, lastErr: null, lastErrMsg: '', via: null };

/* ---------- jaringan dasar ---------- */
const Net = {
  server: null,             // { base, health } bila server lokal terdeteksi
  checked: false,
  async fetch(url, { timeout = 15000, headers, as = 'json' } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers, cache: 'no-store' });
      const body = as === 'text' ? await res.text() : await res.text().then(tx => { try { return JSON.parse(tx); } catch { if (!res.ok) return { _raw: tx }; throw new Error('Respons bukan JSON: ' + tx.slice(0, 120)); } });
      if (!res.ok) {
        const msg = body && body.error ? (body.error.message || body.error) : (body && body._raw ? body._raw.slice(0, 160) : 'HTTP ' + res.status);
        const e = new Error(String(msg)); e.status = res.status; throw e;
      }
      return body;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Batas waktu habis (' + timeout / 1000 + ' dtk)');
      if (e instanceof TypeError) throw new Error('Tidak bisa terhubung (jaringan, CORS, atau diblokir)');
      throw e;
    } finally { clearTimeout(t); }
  },
  candidates() {
    const out = [];
    if (/^https?:$/.test(location.protocol)) out.push(location.origin);
    const saved = Store.get('serverBase', 'http://localhost:8787');
    if (saved && !out.includes(saved)) out.push(saved);
    return out;
  },
  _p: null,
  /* janji tunggal: semua pemanggil data menunggu deteksi server pertama selesai */
  ready() { return this._p || (this._p = this.detect()); },
  async detect() {
    for (const base of this.candidates()) {
      try {
        const h = await this.fetch(base + '/api/health', { timeout: 1800 });
        if (h && h.ok && h.app === 'QuantTerminal') { this.server = { base, health: h }; this.checked = true; bus.emit('server', this.server); return this.server; }
      } catch { /* coba kandidat berikutnya */ }
    }
    this.server = null; this.checked = true; bus.emit('server', null);
    return null;
  },
};

/* ---------- antrean per penyedia (hormati rate limit) ---------- */
const _gates = {};
function gate(id, gapMs) {
  const g = _gates[id] || (_gates[id] = { next: 0, chain: Promise.resolve() });
  return fn => {
    const job = g.chain.then(async () => {
      const w = g.next - Date.now();
      if (w > 0) await new Promise(r => setTimeout(r, w));
      try { return await fn(); } finally { g.next = Date.now() + gapMs; }
    });
    g.chain = job.catch(() => {});
    return job;
  };
}
const GAPS = { gdelt: 6000, coingecko: 2500, worldbank: 120, imf: 250 };

/* ---------- cache browser: memori + localStorage untuk data lambat ---------- */
const _mem = new Map();
const _inflight = new Map();
function cacheGet(key) {
  let e = _mem.get(key);
  if (!e) { try { const s = localStorage.getItem('qtc.' + key); if (s) { e = JSON.parse(s); _mem.set(key, e); } } catch { /* abaikan */ } }
  return e || null;
}
function cacheSet(key, e, persist) {
  _mem.set(key, e);
  if (_mem.size > 400) _mem.delete(_mem.keys().next().value);
  if (persist) {
    try { localStorage.setItem('qtc.' + key, JSON.stringify(e)); }
    catch {                                 // kuota penuh: buang cache lama milik aplikasi ini
      try { Object.keys(localStorage).filter(k => k.startsWith('qtc.')).slice(0, 30).forEach(k => localStorage.removeItem(k)); localStorage.setItem('qtc.' + key, JSON.stringify(e)); } catch { /* menyerah */ }
    }
  }
}

/* ---------- pintu utama: ambil data dari satu penyedia ----------
   opts: { server: '/api/...', direct: 'https://...', fetcher: async () => raw (pengganti direct),
           parse: raw => data (hanya jalur langsung; server sudah mem-parse dengan parser yang sama),
           post: data => bentuk ringkas (dipakai di KEDUA jalur), ttl, persist, key, headers, timeout } 
   hasil: { ok, data, provider, source, via, fetchedAt, cached, stale, quality, sourceUrl, error } */
async function getData(id, opts) {
  if (!Net.checked) await Net.ready();
  const def = SOURCE_DEFS[id] || { name: id, quality: 'delayed' };
  const st = SourceState[id] || (SourceState[id] = { status: 'idle', requests: 0, cacheHits: 0, errors: 0 });
  const key = opts.key || id + '|' + (opts.server || opts.direct);
  const ttl = opts.ttl ?? 10 * 60e3;
  const cached = cacheGet(key);
  if (cached && Date.now() - cached.t < ttl) {
    st.cacheHits++;
    return { ...cached.r, cached: true };
  }
  if (_inflight.has(key)) return _inflight.get(key);
  const p = (async () => {
    const errors = [];
    const tryServer = opts.server && def.server !== false && Net.server;
    const tryDirect = (opts.direct || opts.fetcher) && def.direct;
    if (tryServer) {
      const t0 = performance.now();
      try {
        const env = await Net.fetch(Net.server.base + opts.server, { timeout: opts.timeout || 35000 });
        const ms = Math.round(performance.now() - t0);
        mark(st, true, ms, 'server');
        const r = {
          ok: true, data: opts.post ? opts.post(env.data) : env.data, provider: id, source: env.source || def.name, via: 'server',
          fetchedAt: env.fetchedAt || new Date().toISOString(), cached: !!env.cached, stale: !!env.stale,
          quality: env.stale ? 'stale' : (opts.quality || env.quality || def.quality), sourceUrl: env.sourceUrl || '', extra: env,
        };
        if (!env.stale) cacheSet(key, { t: Date.now(), r }, opts.persist);
        return r;
      } catch (e) { errors.push('server: ' + e.message); mark(st, false, Math.round(performance.now() - t0), 'server', e); }
    }
    if (tryDirect) {
      const t0 = performance.now();
      try {
        const run = opts.fetcher ? opts.fetcher : () => Net.fetch(opts.direct, { timeout: opts.timeout || 20000, headers: opts.headers, as: opts.as || 'json' });
        const raw = GAPS[id] ? await gate(id, GAPS[id])(run) : await run();
        const parsed = opts.parse ? opts.parse(raw) : raw;
        const data = opts.post ? opts.post(parsed) : parsed;
        const ms = Math.round(performance.now() - t0);
        mark(st, true, ms, 'langsung');
        const r = { ok: true, data, provider: id, source: def.name, via: 'langsung', fetchedAt: new Date().toISOString(), cached: false, stale: false, quality: opts.quality || def.quality, sourceUrl: opts.direct };
        cacheSet(key, { t: Date.now(), r }, opts.persist);
        return r;
      } catch (e) { errors.push('langsung: ' + e.message); mark(st, false, Math.round(performance.now() - t0), 'langsung', e); }
    }
    if (!tryServer && !tryDirect) errors.push(def.direct ? 'tidak ada jalur' : 'butuh server lokal (npm start)');
    if (cached) {                          // salinan lama: dipakai TAPI ditandai basi
      return { ...cached.r, cached: true, stale: true, quality: 'stale', error: errors.join(' | ') };
    }
    return { ok: false, data: null, provider: id, source: def.name, error: errors.join(' | ') || 'gagal', quality: 'unavailable' };
  })();
  _inflight.set(key, p);
  try { return await p; } finally { _inflight.delete(key); }
}
function mark(st, ok, ms, via, err) {
  st.requests++; st.latency = ms; st.via = via;
  if (ok) { st.status = 'ok'; st.lastOk = new Date().toISOString(); }
  else { st.errors++; st.lastErr = new Date().toISOString(); st.lastErrMsg = String(err && err.message || err).slice(0, 200); st.status = st.lastOk && Date.now() - Date.parse(st.lastOk) < 3600e3 ? 'degraded' : 'down'; }
  bus.emit('sources');
}

/* ---------- asal-usul data (data lineage): klik angka -> lihat sumbernya ---------- */
const Lineage = {
  m: new Map(), n: 0,
  add(o) {
    const id = 'L' + (++this.n);
    this.m.set(id, o);
    if (this.m.size > 4000) this.m.delete(this.m.keys().next().value);
    return id;
  },
  /* tombol angka yang bisa diklik. o: {label, value, unit, source, url, asOf, fetchedAt, quality, formula, raw, note} */
  wrap(o, html) { return `<button type="button" class="lin" data-lin="${this.add(o)}">${html}</button>`; },
  show(id, anchor) {
    const o = this.m.get(id);
    if (!o) return;
    const pop = $('#linPop');
    const rows = [
      ['Metrik', esc(o.label || '–')],
      ['Nilai', `<b class="num">${esc(o.value ?? '–')}</b>${o.unit ? ' ' + esc(o.unit) : ''}`],
      ['Kualitas', qBadge(o.quality || 'unavailable')],
      ['Sumber', o.home ? `<a href="${safeUrl(o.home)}" target="_blank" rel="noopener">${esc(o.source || '–')}</a>` : esc(o.source || '–')],
      ['Endpoint', o.url ? `<code>${esc(String(o.url).slice(0, 160))}</code>` : '–'],
      ['Periode data', esc(o.asOf || '–')],
      ['Diambil', o.fetchedAt ? `${esc(fmtTime(o.fetchedAt))} (${esc(fmtAge(o.fetchedAt))})` : '–'],
      ['Jalur', esc(o.via || '–')],
    ];
    if (o.formula) rows.push(['Rumus / transformasi', esc(o.formula)]);
    if (o.raw !== undefined && o.raw !== null) rows.push(['Nilai mentah', `<code>${esc(typeof o.raw === 'string' ? o.raw : JSON.stringify(o.raw)).slice(0, 220)}</code>`]);
    if (o.note) rows.push(['Catatan', esc(o.note)]);
    pop.innerHTML = `<div class="lp-head"><strong>Asal-usul data</strong><button type="button" class="icon-btn sm" data-close aria-label="Tutup">×</button></div>` +
      `<dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const pw = Math.min(360, innerWidth - 16);
    pop.style.width = pw + 'px';
    pop.style.left = clamp(r.left, 8, innerWidth - pw - 8) + 'px';
    const below = r.bottom + 6, ph = pop.offsetHeight;
    pop.style.top = (below + ph > innerHeight - 8 ? Math.max(8, r.top - ph - 6) : below) + 'px';
    pop.querySelector('[data-close]').focus();
  },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lin]');
  const pop = document.getElementById('linPop');
  if (b) { e.stopPropagation(); Lineage.show(b.dataset.lin, b); return; }
  if (pop && !pop.hidden && (!pop.contains(e.target) || e.target.closest('[data-close]'))) pop.hidden = true;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const p = document.getElementById('linPop'); if (p && !p.hidden) p.hidden = true; } });

/* ---------- kotak "tidak tersedia" yang menjelaskan sebabnya ---------- */
function unavailableBox(what, res, hint) {
  const why = res && res.error ? res.error : 'sumber tidak merespons';
  return `<div class="na-box"><div>${qBadge('unavailable')} <strong>${esc(what)}</strong></div>` +
    `<p>${esc(why)}</p>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
}
function srcLine(res, extra) {
  if (!res || !res.ok) return '';
  return `<p class="src-line">${qBadge(res.quality)} Sumber: ${esc(res.source)} · diambil ${esc(fmtAge(res.fetchedAt))}${res.via ? ' · lewat ' + esc(res.via) : ''}${res.cached ? ' · cache' : ''}${extra ? ' · ' + extra : ''}</p>`;
}

/* ---------- ekspor CSV / JSON ---------- */
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function toCsv(rows) {
  return rows.map(r => r.map(v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
}
