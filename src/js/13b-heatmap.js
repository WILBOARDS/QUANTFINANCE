/* =====================================================================
   HEATMAP (perintah: HEAT, HEAT US, HEAT CRYPTO, ...)
   - Ukuran kotak = kapitalisasi pasar NYATA; warna = perubahan % (merah turun, hijau naik).
   - Kripto: CoinGecko /coins/markets (market_cap, price_change_percentage_24h; tertunda).
   - Saham: kapitalisasi dari Finnhub profile2 (butuh FINNHUB_API_KEY; paket gratis Finnhub hanya
     untuk saham AS) dan perubahan dari Quotes.get. Aset tanpa kapitalisasi nyata TIDAK diberi
     ukuran karangan: dicantumkan di bawah peta sebagai "tanpa kapitalisasi pasar".
   - Tanpa simulasi, termasuk di Mode Demo. Treemap squarified di shared/cryptox.mjs (diuji).
   ===================================================================== */
const HeatmapPage = (() => {
  const X = Cryptox;
  const REGIONS = { GLOBAL: 'Global', US: 'AS', EUROPE: 'Eropa', ASIA: 'Asia-Pasifik', INDONESIA: 'Indonesia', CRYPTO: 'Kripto' };
  const EU = new Set(['GB', 'DE', 'FR', 'NL', 'CH', 'ES', 'IT', 'SE', 'DK', 'NO', 'FI', 'BE', 'IE', 'AT', 'PT', 'PL']);
  const ASIA = new Set(['JP', 'CN', 'HK', 'KR', 'TW', 'IN', 'SG', 'AU', 'NZ', 'TH', 'MY', 'PH', 'VN']);
  const inRegion = (e, r) => e.type === 'stock' && (r === 'GLOBAL' || (r === 'US' && e.country === 'US') || (r === 'EUROPE' && EU.has(e.country)) || (r === 'ASIA' && ASIA.has(e.country)) || (r === 'INDONESIA' && e.country === 'ID'));
  const S = { region: Store.get('hmRegion', 'GLOBAL'), seq: 0, built: false, data: {}, ro: null };
  const fhOn = () => !!(Net.server && Net.server.health.keys && Net.server.health.keys.finnhub);

  /* ---------- kripto ---------- */
  async function loadCrypto(alive) {
    const r = await getData('coingecko', { server: '/api/crypto/markets?per=50', direct: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h', parse: Parsers.parseCoinGecko, ttl: 60e3, key: 'cgm', alive });
    if (!r.ok) return { ok: false, r };
    const q = r.stale ? 'stale' : 'delayed';
    const tiles = [], rest = [];
    for (const c of r.data) {
      const e = REG.all().find(x => x.type === 'crypto' && x.providers && x.providers.coingecko === c.id) || null;
      const t = { key: 'cg:' + c.id, e, sym: c.sym, name: c.name, value: c.mcap, chg: c.chg24, ref: c,
        lin: { source: 'CoinGecko /coins/markets', quality: q, asOf: c.updated, fetchedAt: r.fetchedAt, via: r.via, home: 'https://www.coingecko.com/en/api' } };
      if (Number.isFinite(c.mcap) && c.mcap > 0) tiles.push(t); else rest.push({ ...t, why: 'CoinGecko tidak memberi kapitalisasi pasar' });
    }
    return { ok: true, tiles, rest, src: r, note: 'Ukuran = kapitalisasi pasar (CoinGecko, USD). Warna = perubahan 24 jam bergulir. Data CoinGecko tertunda beberapa menit (kualitas "Tertunda").' };
  }

  /* ---------- saham ---------- */
  /* batas jumlah saham per peta: kapitalisasi + harga = 2 permintaan Finnhub per saham, kuota gratis 60/menit */
  const MAX_STOCKS = 30;
  async function loadStocks(region, alive, progress) {
    const all = REG.all().filter(e => inRegion(e, region)).sort((a, b) => (b.weight || 0) - (a.weight || 0) || a.symbol.localeCompare(b.symbol));
    const list = all.slice(0, MAX_STOCKS), skipped = all.length - list.length;
    const tiles = [], rest = [];
    let i = 0, fetchedAt = null;
    const one = async e => {
      const P = e.providers || {};
      const usable = fhOn() && P.finnhub && e.country === 'US';
      const [prof, q] = await Promise.all([
        usable ? getData('finnhub', { server: `/api/finnhub?kind=profile&symbol=${encodeURIComponent(P.finnhub)}`, ttl: 12 * 3600e3, persist: true, key: 'fh:profile:' + P.finnhub, alive }) : Promise.resolve(null),
        Quotes.get(e).catch(err => ({ ok: false, reason: err.message, price: datum(null, { reason: err.message }) })),
      ]);
      if (!alive()) return;
      const chg = q && q.changePct && q.changePct.value !== null ? q.changePct.value : null;
      const mc = prof && prof.ok && prof.data && Number.isFinite(prof.data.mcap) && prof.data.mcap > 0 ? prof.data.mcap * 1e6 : null;
      const base = { key: e.id, e, sym: e.symbol, name: e.name, chg, q };
      if (mc !== null && (prof.data.currency || 'USD') === 'USD') {
        if (!fetchedAt || prof.fetchedAt < fetchedAt) fetchedAt = prof.fetchedAt;
        tiles.push({ ...base, value: mc, lin: { source: 'Finnhub profile2 (kapitalisasi) + ' + ((q && q.price && q.price.source) || 'tanpa harga'), quality: prof.stale ? 'stale' : 'delayed', fetchedAt: prof.fetchedAt, via: 'server', home: 'https://finnhub.io/docs/api/company-profile2', note: 'Kapitalisasi pasar Finnhub (juta USD × 1 juta); diperbarui harian oleh Finnhub.' } });
      } else {
        const why = !fhOn() ? 'kapitalisasi butuh FINNHUB_API_KEY di server' : e.country !== 'US' || !P.finnhub ? 'Finnhub gratis hanya memberi profil saham AS' : prof && !prof.ok ? 'profil Finnhub gagal: ' + (prof.error || '') : 'kapitalisasi tidak dilaporkan';
        rest.push({ ...base, why });
      }
    };
    let done = 0;
    const note = 'Ukuran = kapitalisasi pasar (Finnhub profile2, USD). Warna = perubahan % sejak penutupan sebelumnya dari sumber harga masing-masing saham (kualitas per kotak, lihat asal-usulnya). Hanya saham di katalog aplikasi, bukan seluruh pasar' + (skipped > 0 ? `; ${MAX_STOCKS} saham dengan bobot katalog tertinggi dimuat, ${skipped} lainnya tidak (menghemat kuota Finnhub gratis 60 permintaan/menit).` : '.');
    const snap = () => ({ ok: true, tiles: tiles.slice(), rest: rest.slice(), src: { fetchedAt, source: 'Finnhub + sumber harga per saham' }, note, partial: done < list.length, done, total: list.length });
    const worker = async () => { while (i < list.length) { if (!alive()) return; await one(list[i++]); done++; if (progress && done % 4 === 0 && done < list.length) progress(snap()); } };
    await Promise.all([worker(), worker()]);
    return snap();
  }

  /* ---------- gambar ---------- */
  function draw() {
    const d = S.data[S.region], map = $('#hmMap');
    if (!d) return;
    if (!d.ok) { map.innerHTML = unavailableBox('Heatmap ' + REGIONS[S.region], d.r || {}); $('#hmLegend').innerHTML = ''; $('#hmRest').innerHTML = ''; return; }
    const W = Math.max(280, map.clientWidth || 800), H = Math.round(Math.max(260, Math.min(560, W * 0.55)));
    const tiles = X.squarify(d.tiles, 0, 0, W, H);
    const total = d.tiles.reduce((s, t) => s + t.value, 0);
    map.innerHTML = tiles.length ? `<svg class="hm-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="Heatmap ${esc(REGIONS[S.region])}: ${tiles.length} aset, ukuran kapitalisasi pasar, warna perubahan persen">
      ${tiles.map((t, k) => {
        const big = t.w > 54 && t.h > 30, chgTxt = Number.isFinite(t.chg) ? (t.chg >= 0 ? '+' : '') + fmt(t.chg, 2) + '%' : 'n/a';
        /* nama aksesibel diawali teks yang terlihat di kotak (kode + perubahan), lalu rinciannya */
        const label = `${t.sym} ${chgTxt}: ${t.name}, kapitalisasi ${fmtCompact(t.value)} USD (${fmt(t.value / total * 100, 1)}% dari peta)`;
        return `<g class="hm-t" data-k="${k}" tabindex="0" role="button" aria-label="${esc(label)}"><title>${esc(label)}</title><rect x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" width="${Math.max(0, t.w - 1).toFixed(1)}" height="${Math.max(0, t.h - 1).toFixed(1)}" fill="${X.changeColor(t.chg)}"/>${big ? `<text x="${(t.x + t.w / 2).toFixed(1)}" y="${(t.y + t.h / 2 - 2).toFixed(1)}" text-anchor="middle" class="hm-s">${esc(t.sym)}</text><text x="${(t.x + t.w / 2).toFixed(1)}" y="${(t.y + t.h / 2 + 12).toFixed(1)}" text-anchor="middle" class="hm-c">${esc(chgTxt)}</text>` : ''}</g>`;
      }).join('')}</svg>` : `<p class="empty">Tidak ada aset dengan kapitalisasi pasar nyata untuk wilayah ini.</p>`;
    S.tiles = tiles;
    const steps = [-5, -3, -1, 0, 1, 3, 5];
    $('#hmLegend').innerHTML = `<span class="meta">Perubahan:</span>${steps.map(v => `<span class="hm-sw"><i style="background:${X.changeColor(v)}"></i>${v > 0 ? '+' : ''}${v}%</span>`).join('')}<span class="hm-sw"><i style="background:${X.changeColor(NaN)}"></i>n/a</span>
      <span class="meta">${tiles.length} kotak · ${d.src && d.src.fetchedAt ? 'kapitalisasi diambil ' + esc(fmtAge(d.src.fetchedAt)) : ''} ${d.src && d.src.stale ? qBadge('stale') : ''}</span>`;
    $('#hmRest').innerHTML = d.rest.length ? `<h3 class="fa-h3">Tanpa kapitalisasi pasar (${d.rest.length}) ${qBadge('unavailable', 'tidak diberi ukuran karangan')}</h3>
      <div class="table-wrap"><table class="dense static hm-rest"><thead><tr><th scope="col">Kode</th><th scope="col" class="num">Perubahan</th><th scope="col">Alasan tanpa ukuran</th></tr></thead><tbody>
      ${d.rest.map(t => `<tr data-rest="${esc(t.key)}"><th scope="row">${t.e ? `<button type="button" class="link-btn" data-hm-open="${esc(t.e.id)}">${esc(t.sym)}</button>` : esc(t.sym)} <span class="sub">${esc(t.name)}</span></th><td class="num ${sign(t.chg)}">${Number.isFinite(t.chg) ? esc(fmtPct(t.chg / 100, 2)) : '–'}</td><td>${esc(t.why)}</td></tr>`).join('')}</tbody></table></div>` : '';
    $('#hmNote').textContent = d.note + ' Klik kotak = buka detail aset; Shift+klik (atau tombol I saat kotak terpilih) = asal-usul angka. Peta ini penyajian data, bukan rekomendasi.';
    $('#hmMeta').innerHTML = esc(REGIONS[S.region]) + (d.partial ? ` · <span class="loading sm">memuat ${d.done} dari ${d.total}</span>` : '');
  }
  function openTile(t) {
    if (!t) return;
    let e = t.e;
    if (!e && t.ref) e = REG.add({ id: 'crypto:' + t.sym, type: 'crypto', symbol: t.sym, name: t.name, currency: 'USD', providers: { coingecko: t.ref.id }, aliases: [] });
    if (e) { SecurityPage.open(e, 'overview'); App.showPage('security'); }
  }
  function tileLineage(t) {
    return { label: `${t.sym} · kapitalisasi pasar`, value: fmtCompact(t.value) + ' USD', ...t.lin, note: (t.lin.note || '') + ` Perubahan: ${Number.isFinite(t.chg) ? fmt(t.chg, 2) + '%' : 'tidak tersedia'}.` };
  }
  async function load() {
    const my = ++S.seq, region = S.region, alive = () => my === S.seq && !$('#page-heatmap').hidden;
    $('#hmMap').innerHTML = `<p class="loading">Mengambil data ${esc(REGIONS[region])}</p>`;
    $('#hmRest').innerHTML = ''; $('#hmLegend').innerHTML = '';
    if (!Net.checked) await Net.ready();
    let d;
    const progress = part => { if (alive() && S.region === region) { S.data[region] = part; draw(); } };
    try { d = region === 'CRYPTO' ? await loadCrypto(alive) : await loadStocks(region, alive, progress); }
    catch (err) { ErrorLog.report('render', 'Heatmap ' + region + ': ' + err.message, err.stack); d = { ok: false, r: { error: 'Kesalahan aplikasi: ' + err.message } }; }
    if (!alive()) { if ($('#hmMap .loading')) $('#hmMap').innerHTML = ''; return; }
    S.data[region] = d;
    draw();
  }
  function setRegion(r) {
    if (!REGIONS[r]) r = 'GLOBAL';
    S.region = r; Store.set('hmRegion', r);
    $$('#hmRegions [data-region]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.region === r)));
    if (S.data[r] && !S.data[r].partial) draw(); else load();
  }
  function build() {
    if (S.built) return;
    S.built = true;
    $('#hmRegions').innerHTML = Object.entries(REGIONS).map(([k, l]) => `<button type="button" data-region="${k}" aria-pressed="${k === S.region}">${esc(l)}</button>`).join('');
    $('#hmRegions').addEventListener('click', ev => { const b = ev.target.closest('[data-region]'); if (b) setRegion(b.dataset.region); });
    $('#hmReload').addEventListener('click', () => { delete S.data[S.region]; load(); });
    const map = $('#hmMap');
    map.addEventListener('click', ev => {
      const g = ev.target.closest('.hm-t'); if (!g || !S.tiles) return;
      const t = S.tiles[+g.dataset.k];
      if (ev.altKey || ev.shiftKey) { Lineage.show(Lineage.add(tileLineage(t)), g); return; }
      openTile(t);
    });
    map.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('.hm-t')) { ev.preventDefault(); openTile(S.tiles[+ev.target.closest('.hm-t').dataset.k]); } if (ev.key.toLowerCase() === 'i' && ev.target.closest('.hm-t')) { const g = ev.target.closest('.hm-t'); Lineage.show(Lineage.add(tileLineage(S.tiles[+g.dataset.k])), g); } });
    $('#hmRest').addEventListener('click', ev => { const b = ev.target.closest('[data-hm-open]'); if (b) { const e = REG.get(b.dataset.hmOpen); if (e) { SecurityPage.open(e, 'overview'); App.showPage('security'); } } });
    let rt = null;
    if (typeof ResizeObserver !== 'undefined') { S.ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (!$('#page-heatmap').hidden) draw(); }, 150); }); S.ro.observe(map); }
  }
  return {
    show() { build(); setRegion(S.region); },
    hide() { S.seq++; },
    /* dari perintah HEAT <wilayah> */
    region(key) { build(); setRegion(String(key || 'GLOBAL').toUpperCase()); },
    get state() { const d = S.data[S.region]; return { region: S.region, tiles: d && d.ok ? d.tiles.length : 0, rest: d && d.ok ? d.rest.length : 0, ok: !!(d && d.ok && !d.partial), partial: !!(d && d.partial) }; },
  };
})();
App.registerPage('heatmap', HeatmapPage, { group: 'pasar', label: 'Heatmap', after: 'market', icon: '<rect x="3" y="3" width="10" height="11"/><rect x="13" y="3" width="8" height="6"/><rect x="13" y="9" width="8" height="12"/><rect x="3" y="14" width="10" height="7"/>' });
