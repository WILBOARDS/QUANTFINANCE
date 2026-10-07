/* =====================================================================
   SCREENER (perintah: SCREEN, SCREEN GROWTH, ...)
   - Data: SEC EDGAR XBRL frames lewat server (/api/sec/frames): satu konsep untuk semua pelapor
     bertiker pada satu tahun kalender. Rumus & preset di shared/screener.mjs (diuji).
   - VALUE (P/E) dan MOMENTUM butuh harga. Tidak ada API resmi gratis yang memberi harga seluruh
     pasar AS, jadi keduanya hanya dihitung untuk saham AS di katalog aplikasi yang punya harga
     nyata (Quotes), dan cakupannya ditulis ("dihitung untuk N saham yang punya harga").
   - Tabel menampilkan maksimal 200 baris teratas sesuai urutan; jumlah sisanya ditulis.
   - Klik baris = buka detail aset (tab Fundamental). Ticker yang belum ada di katalog ditambahkan
     sebagai data referensi (kode, nama, CIK), tanpa angka pasar karangan.
   ===================================================================== */
const ScreenerPage = (() => {
  const SC = Screener;
  const MAX_ROWS = 200;
  const PRICE_POOL = 4;                 // permintaan harga paralel untuk VALUE/MOMENTUM
  const S = { preset: Store.get('scrPreset', 'GROWTH'), year: null, filters: {}, sort: null, rows: null, frames: {}, meta: null, seq: 0, built: false, ext: null, extNote: '' };
  /* kolom tabel; ext = hanya tampil bila preset butuh harga */
  const COLS = ['revenue', 'netIncome', 'netMargin', 'roe', 'roa', 'liabEquity', 'currentRatio', 'revGrowth', 'fcfMargin', 'payout', 'health'];
  const FILTERABLE = ['revenue', 'netIncome', 'netMargin', 'roa', 'roe', 'liabEquity', 'currentRatio', 'revGrowth', 'fcfMargin', 'dividendsPaid', 'payout', 'health', 'pe', 'mom6'];
  const isPct = k => SC.METRICS[k].fmt === 'pct';
  const show = (v, f) => (v === null || v === undefined || !Number.isFinite(v) ? '–'
    : f === 'pct' ? fmt(v * 100, 1) + '%' : f === 'x' ? fmt(v, 2) + '×' : f === 'score' ? v + '/3' : fmtCompact(v));
  const years = () => { const d = SC.defaultYear(); return [d, d - 1, d - 2, d - 3, d - 4]; };

  /* ---------- ambil frames (berurutan terbatas; server membatasi 5/detik ke SEC) ---------- */
  async function fetchFrames(year, needEps, alive) {
    const plan = SC.plan(year, { eps: needEps });
    const out = {}, errs = [];
    let fetchedAt = null, stale = false, i = 0;
    const one = async it => {
      const q = `concept=${encodeURIComponent(it.concept)}&unit=${encodeURIComponent(it.unit)}&period=${encodeURIComponent(it.period)}`;
      const r = await getData('sec', { server: '/api/sec/frames?' + q, ttl: 24 * 3600e3, key: 'sec:fr:' + it.concept + ':' + it.period, timeout: 90000, alive });
      if (r.ok && r.data) {
        out[SC.frameKey(it.concept, it.period)] = r.data;
        if (!fetchedAt || r.fetchedAt < fetchedAt) fetchedAt = r.fetchedAt;
        stale = stale || !!r.stale;
      } else errs.push({ it, r });
    };
    const worker = async () => { while (i < plan.length) { if (alive && !alive()) return; await one(plan[i++]); } };
    await Promise.all([worker(), worker(), worker()]);
    return { frames: out, errs, fetchedAt, stale, plan };
  }

  /* ---------- harga untuk P/E dan momentum: hanya saham AS di katalog ---------- */
  async function priceExt(rows, kind, alive) {
    const tasks = [];
    for (const r of rows) {
      const e = REG.resolve(r.ticker, ['stock']);
      if (e && e.country === 'US' && e.currency === 'USD') tasks.push({ r, e });
    }
    const ext = new Map();
    let i = 0;
    const worker = async () => {
      while (i < tasks.length) {
        const t = tasks[i++];
        if (alive && !alive()) return;
        try {
          if (kind === 'price') {
            const q = await Quotes.get(t.e);
            const p = q && q.price;
            const eps = t.r.v.eps ? t.r.v.eps.value : null;
            if (p && Number.isFinite(p.value)) ext.set(t.r.cik, { pe: eps > 0 ? p.value / eps : null, price: p, eps });
          } else {
            const h = await Quotes.history(t.e, '1Y');
            const m = SC.momentum(h.bars || []);
            if (m) ext.set(t.r.cik, { mom6: m.value, mom: m, hist: h });
          }
        } catch (err) { ErrorLog.report('data', 'Screener harga ' + t.r.ticker + ': ' + err.message); }
      }
    };
    await Promise.all(Array.from({ length: PRICE_POOL }, worker));
    return { ext, candidates: tasks.length };
  }

  /* ---------- muat + hitung ---------- */
  async function load() {
    const my = ++S.seq, alive = () => my === S.seq && !$('#page-screener').hidden;
    const P = SC.PRESETS[S.preset];
    const year = S.year;
    $('#scrSum').innerHTML = '<span class="loading">Mengambil frames SEC EDGAR CY' + esc(year) + '</span>';
    $('#scrBody').innerHTML = '';
    if (!Net.checked) await Net.ready();
    if (!Net.server) {
      $('#scrSum').innerHTML = '';
      $('#scrBody').innerHTML = unavailableBox('Screener', { error: 'Butuh server lokal: SEC EDGAR tidak bisa dipanggil langsung dari browser (tanpa CORS) dan mewajibkan User-Agent berisi kontak.' }, 'Jalankan <code>npm start</code>, isi <code>SEC_USER_AGENT</code> di <code>.env</code>, lalu buka http://localhost:8787.');
      return;
    }
    const F = await fetchFrames(year, P.needs === 'price', alive);
    if (!alive()) return;
    if (!Object.keys(F.frames).length) {
      const r = (F.errs[0] || {}).r || {};
      $('#scrSum').innerHTML = '';
      $('#scrBody').innerHTML = unavailableBox('Screener CY' + year, r, /SEC_USER_AGENT/.test(r.error || '') ? 'Contoh baris di <code>.env</code>: <code>SEC_USER_AGENT="Nama Kamu emailkamu@domain"</code> (pakai email aslimu), lalu jalankan ulang <code>npm start</code>.' : '');
      return;
    }
    const rows = SC.joinFrames(F.frames, year);
    S.ext = null; S.extNote = '';
    if (P.needs) {
      $('#scrSum').innerHTML = `<span class="loading">${P.needs === 'price' ? 'Mengambil harga' : 'Mengambil riwayat harga'} saham AS di katalog</span>`;
      const X = await priceExt(rows, P.needs, alive);
      if (!alive()) return;
      S.ext = X.ext;
      S.extNote = `${P.needs === 'price' ? 'P/E' : 'Momentum'} dihitung untuk ${X.ext.size} dari ${X.candidates} saham AS di katalog aplikasi yang punya ${P.needs === 'price' ? 'harga' : 'riwayat harga'} nyata; ${rows.length - X.candidates} pelapor lain tidak punya sumber harga gratis di aplikasi ini, jadi nilainya "–".`;
    }
    for (const r of rows) SC.computeMetrics(r, S.ext && S.ext.get(r.cik) || {});
    S.rows = rows; S.frames = F;
    draw();
  }

  /* ---------- tampilan ---------- */
  function buildFilters() {
    $('#scrFilters').innerHTML = FILTERABLE.map(k => {
      const m = SC.METRICS[k], f = S.filters[k] || {}, u = isPct(k) ? '%' : m.fmt === 'usd' ? 'USD' : '';
      const v = x => (Number.isFinite(x) ? String(isPct(k) ? +(x * 100).toFixed(4) : x) : '');
      const on = Number.isFinite(f.min) || Number.isFinite(f.max);
      return `<div class="scr-f${on ? ' on' : ''}"><span title="${esc(m.formula || m.label)}">${esc(m.label)}${u ? ' (' + u + ')' : ''}</span>
        <input type="number" step="any" inputmode="decimal" data-f="${k}" data-b="min" value="${esc(v(f.min))}" placeholder="min" aria-label="${esc(m.label)} minimum${u ? ' (' + u + ')' : ''}">
        <input type="number" step="any" inputmode="decimal" data-f="${k}" data-b="max" value="${esc(v(f.max))}" placeholder="maks" aria-label="${esc(m.label)} maksimum${u ? ' (' + u + ')' : ''}"></div>`;
    }).join('');
  }
  function readFilters() {
    const f = {};
    $$('#scrFilters input[data-f]').forEach(i => {
      const raw = i.value.trim();
      if (raw === '') return;
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n)) return;
      const k = i.dataset.f;
      (f[k] = f[k] || {})[i.dataset.b] = isPct(k) ? n / 100 : n;
    });
    return f;
  }
  const filterText = f => Object.entries(f).map(([k, x]) => {
    const m = SC.METRICS[k], s = v => show(v, m.fmt === 'score' ? 'n' : m.fmt);
    return `${m.label}${Number.isFinite(x.min) ? ' > ' + s(x.min) : ''}${Number.isFinite(x.min) && Number.isFinite(x.max) ? ' dan' : ''}${Number.isFinite(x.max) ? ' < ' + s(x.max) : ''}`;
  }).join('; ') || 'tanpa filter';

  /* asal-usul satu sel (dibuat saat diklik supaya tabel besar tetap ringan) */
  function lineageOf(r, k) {
    const m = SC.METRICS[k], F = S.frames, src = (v, key) => (r.v[key] ? `${key}: ${r.v[key].concept} ${r.v[key].period} = ${fmt(r.v[key].value, 0)} (accession ${r.v[key].accn || '–'})` : `${key}: tidak dilaporkan`);
    const home = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + String(r.cik).padStart(10, '0');
    const base = { label: `${m.label} · ${r.ticker}`, value: show(r.m[k], m.fmt), home, fetchedAt: F.fetchedAt, asOf: 'CY' + S.year };
    if (k === 'pe' || k === 'mom6') {
      const x = S.ext && S.ext.get(r.cik) || {};
      const p = k === 'pe' ? x.price : null;
      return { ...base, quality: 'calculated', source: k === 'pe' ? `Kalkulasi: harga (${p ? p.source : '–'}) ÷ EPS SEC frames` : `Kalkulasi dari riwayat harga (${x.hist ? x.hist.source : '–'})`, formula: m.formula,
        note: k === 'pe' ? `harga ${p ? fmt(p.value, 2) + ' (' + (p.asOf || p.fetchedAt || '') + ')' : '–'}; EPS dilusian CY${S.year} = ${x.eps ?? '–'}. Harga dan laporan dari waktu berbeda.` : (x.mom ? `dari ${new Date(x.mom.from * 1000).toISOString().slice(0, 10)} (${fmt(x.mom.base, 2)}) ke ${new Date(x.mom.to * 1000).toISOString().slice(0, 10)} (${fmt(x.mom.last, 2)})` : '') };
    }
    if (m.raw) {
      const key = k === 'netIncome' ? 'netIncome' : k;
      const x = r.v[key];
      return { ...base, quality: F.stale ? 'stale' : 'historical', source: 'SEC EDGAR frames · us-gaap:' + (x ? x.concept : '–'), url: x ? SC.frameUrl(x.concept, SC.FRAME_ALLOW[x.concept].unit, x.period) : '', currency: 'USD',
        period: x ? (x.start ? x.start + ' s/d ' + x.end : 'per ' + x.end) : '', note: x ? 'accession ' + (x.accn || '–') : '' };
    }
    if (k === 'health') return { ...base, quality: 'calculated', source: 'Kalkulasi dari SEC EDGAR frames', formula: m.formula, note: r.health.criteria.map(c => `${c.id} ${c.label}: ${c.pass === null ? 'Data kurang' : c.pass ? 'lolos' : 'tidak lolos'}`).join('; ') };
    return { ...base, quality: 'calculated', source: 'Kalkulasi dari SEC EDGAR frames', formula: m.formula, note: 'Input: ' + (m.inputs || []).map(i => src(null, i)).join('; ') };
  }

  function draw() {
    if (!S.rows) return;
    const P = SC.PRESETS[S.preset];
    const { pass, missing } = SC.applyFilters(S.rows, S.filters);
    const [sk, sd] = S.sort || P.sort;
    const sorted = SC.sortRows(pass, sk, sd);
    const shown = sorted.slice(0, MAX_ROWS);
    const cols = [...COLS, ...(P.needs === 'price' ? ['pe'] : []), ...(P.needs === 'history' ? ['mom6'] : [])];
    const F = S.frames;
    $('#scrMeta').innerHTML = `${qBadge(F.stale ? 'stale' : 'historical', 'SEC EDGAR frames')} CY${esc(S.year)} · diambil ${esc(fmtAge(F.fetchedAt))}`;
    const fail = F.errs.length ? ` · ${F.errs.length} frame gagal dimuat (${esc(F.errs.map(x => x.it.concept).join(', '))}); metrik yang memakainya "–"` : '';
    $('#scrSum').innerHTML = `<b>Hasil screening ${esc(P.label)}</b><span>${pass.length} dari ${S.rows.length} pelapor bertiker lolos</span><span>${missing} dikecualikan karena data kurang</span><span>Filter: ${esc(filterText(S.filters))}</span>${sorted.length > MAX_ROWS ? `<span>menampilkan ${MAX_ROWS} teratas menurut urutan; ${sorted.length - MAX_ROWS} lainnya ada di CSV</span>` : ''}${S.extNote ? `<span>${esc(S.extNote)}</span>` : ''}${fail}`;
    if (!shown.length) { $('#scrBody').innerHTML = `<p class="empty">Tidak ada pelapor yang lolos filter ini. Longgarkan filter atau pilih tahun lain.</p>`; return; }
    const th = k => { const m = SC.METRICS[k], on = sk === k; return `<th class="num" scope="col" aria-sort="${on ? (sd === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}" title="${esc(m.formula || m.label)}">${esc(m.label)}${on ? (sd === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`; };
    $('#scrBody').innerHTML = `<table class="dense scr-tbl"><caption class="sr">Hasil screening ${esc(P.label)} CY${esc(S.year)}</caption><thead><tr><th scope="col"><button type="button" data-sort="ticker">Kode${sk === 'ticker' ? (sd === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>${cols.map(th).join('')}</tr></thead><tbody>
      ${shown.map(r => `<tr data-cik="${r.cik}" tabindex="0" aria-label="${esc(r.ticker + ' ' + r.name)}: buka detail"><td><b>${esc(r.ticker)}</b><span class="nm">${esc(r.name)}</span></td>${cols.map(k => { const v = r.m[k], f = SC.METRICS[k].fmt; return `<td class="num">${v === null || v === undefined ? '<span class="na" title="Data kurang">–</span>' : `<button type="button" class="lin" data-scr="${k}">${esc(show(v, f))}</button>`}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table>`;
  }
  function renderPresets() {
    $('#scrPresets').innerHTML = Object.entries(SC.PRESETS).map(([k, p]) => `<button type="button" data-preset="${k}" aria-pressed="${k === S.preset}" title="${esc(p.note)}">${esc(p.label)}</button>`).join('');
    $('#scrNote').textContent = SC.PRESETS[S.preset].note + (SC.PRESETS[S.preset].needs ? '' : ' Semua dari laporan SEC, tanpa harga.');
  }
  function setPreset(key, reload = true) {
    if (!SC.PRESETS[key]) return;
    const prevNeeds = SC.PRESETS[S.preset] && SC.PRESETS[S.preset].needs;
    S.preset = key; Store.set('scrPreset', key);
    S.filters = JSON.parse(JSON.stringify(SC.PRESETS[key].filters));
    S.sort = null;
    renderPresets(); buildFilters();
    /* frames sama untuk semua preset; ambil ulang hanya bila butuh EPS/harga yang belum ada */
    if (reload && (!S.rows || SC.PRESETS[key].needs || prevNeeds)) load(); else draw();
  }
  function openRow(cik) {
    const r = S.rows && S.rows.find(x => x.cik === cik);
    if (!r) return;
    let e = REG.resolve(r.ticker, ['stock']);
    if (!e || e.country !== 'US') {
      /* data referensi saja: kode, nama, CIK. Tanpa harga/angka karangan. */
      e = REG.add({ id: 'stock:' + r.ticker, type: 'stock', symbol: r.ticker, name: r.name.replace(/\s+/g, ' ').trim() || r.ticker, country: 'US', currency: 'USD', exchange: 'US', sector: '', aliases: [], providers: { finnhub: r.ticker, cik: String(r.cik).padStart(10, '0') } });
    }
    SecurityPage.open(e, 'fa');
    App.showPage('security');
  }

  function build() {
    if (S.built) return;
    S.built = true;
    const ys = years();
    S.year = ys.includes(Store.get('scrYear', ys[0])) ? Store.get('scrYear', ys[0]) : ys[0];
    $('#scrYear').innerHTML = ys.map(y => `<option value="${y}"${y === S.year ? ' selected' : ''}>CY${y}</option>`).join('');
    $('#scrYear').addEventListener('change', ev => { S.year = +ev.target.value; Store.set('scrYear', S.year); load(); });
    $('#scrReload').addEventListener('click', load);
    $('#scrPresets').addEventListener('click', ev => { const b = ev.target.closest('[data-preset]'); if (b) setPreset(b.dataset.preset); });
    $('#scrApply').addEventListener('click', () => { S.filters = readFilters(); buildFilters(); draw(); });
    $('#scrFilters').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('#scrApply').click(); } });
    $('#scrClear').addEventListener('click', () => { S.filters = {}; buildFilters(); draw(); });
    $('#scrCsv').addEventListener('click', () => {
      if (!S.rows) return;
      const P = SC.PRESETS[S.preset], [sk, sd] = S.sort || P.sort;
      const rows = SC.sortRows(SC.applyFilters(S.rows, S.filters).pass, sk, sd);
      const keys = [...COLS, 'fcf', 'dividendsPaid', 'pe', 'mom6'];
      download(`screener-${P.label.replace(/\s+/g, '-').toLowerCase()}-CY${S.year}.csv`, toCsv([['ticker', 'nama', 'cik', ...keys.map(k => SC.METRICS[k].label)], ...rows.map(r => [r.ticker, r.name, r.cik, ...keys.map(k => r.m[k])])]), 'text/csv');
    });
    $('#scrBody').addEventListener('click', ev => {
      const b = ev.target.closest('[data-scr]');
      const tr = ev.target.closest('tr[data-cik]');
      if (b && tr) { ev.stopPropagation(); const r = S.rows.find(x => x.cik === +tr.dataset.cik); if (r) Lineage.show(Lineage.add(lineageOf(r, b.dataset.scr)), b); return; }
      const s = ev.target.closest('[data-sort]');
      if (s) {
        const k = s.dataset.sort, [ck, cd] = S.sort || SC.PRESETS[S.preset].sort;
        S.sort = [k, ck === k ? (cd === 'asc' ? 'desc' : 'asc') : k === 'ticker' ? 'asc' : 'desc'];
        draw();
        const again = $(`#scrBody [data-sort="${k}"]`); if (again) again.focus();
        return;
      }
      if (tr) openRow(+tr.dataset.cik);
    });
    $('#scrBody').addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || ev.target.closest('button')) return;
      const tr = ev.target.closest('tr[data-cik]');
      if (tr) { ev.preventDefault(); openRow(+tr.dataset.cik); }
    });
    S.filters = JSON.parse(JSON.stringify((SC.PRESETS[S.preset] || SC.PRESETS.GROWTH).filters));
    if (!SC.PRESETS[S.preset]) S.preset = 'GROWTH';
    renderPresets(); buildFilters();
  }
  return {
    show() { build(); if (!S.rows) load(); else draw(); },
    hide() { S.seq++; },
    /* dari perintah SCREEN <preset> (null = tetap preset terakhir) */
    preset(key) { build(); if (key) setPreset(key); },
    get state() { return { preset: S.preset, year: S.year, rows: S.rows ? S.rows.length : null, filters: S.filters }; },
  };
})();
App.registerPage('screener', ScreenerPage, { group: 'pasar', label: 'Screener', after: 'watchlist', icon: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>' });
