/* =====================================================================
   TERMINAL: registri entitas saat aplikasi berjalan + pelaksana perintah
   - REG: katalog referensi (shared/entity-seed.mjs) + semua negara (COUNTRY_META) +
     topik berita (Analytics.THEMES) + chokepoint (CHOKE_REF). Bisa diperluas saat jalan.
   - Terminal.run(teks): parse (shared/commands.mjs) lalu jalankan aksinya. Parser murni dan
     diuji di Node; bagian ini hanya menghubungkan hasilnya ke halaman.
   ===================================================================== */
const REG = Entities.createRegistry([
  ...EntitySeed.SEED,
  ...EntitySeed.countryEntities(COUNTRY_META),
  ...EntitySeed.topicEntities(Analytics.THEMES),
  ...EntitySeed.chokepointEntities(CHOKE_REF),
]);
/* instrumen daftar Pasar yang belum ada di katalog (mis. ditambah di versi lama) tetap bisa dicari */
for (const i of INSTS) {
  if (REG.bySymbol(i.sym, i.type)) continue;
  REG.add({ id: i.type + ':' + i.sym, type: i.type, symbol: i.sym, name: i.name, currency: i.cur, country: (MARKETS[i.mkt] || {}).id || '', providers: { ...(i.bn ? { binance: i.bn } : {}), ...(YAHOO_SYM[i.sym] ? { yahoo: YAHOO_SYM[i.sym] } : {}) } }, { silent: true });
}
const iso3Of = e => (e && e.type === 'country' ? e.id.split(':')[1] : null);
const TOPIC_CAT = { monetary: 'macro', inflation: 'macro', growth: 'macro', jobs: 'macro', fiscal: 'macro', trade: 'geo', sanctions: 'geo', conflict: 'geo', politics: 'politics', unrest: 'politics', energy: 'energy', shipping: 'shipping', currency: 'markets', markets: 'markets' };

const Terminal = (() => {
  const HIST_KEY = 'cmdHistory';
  const history = () => Store.get(HIST_KEY, []);
  function remember(text) {
    const h = history().filter(x => x !== text);
    h.unshift(text);
    Store.set(HIST_KEY, h.slice(0, 40));
  }
  const scrollTo = sel => setTimeout(() => { const el = $(sel); if (el) el.scrollIntoView({ block: 'start' }); }, 60);
  const has = id => !!document.getElementById('page-' + id);

  /* menjalankan hasil parse(). Mengembalikan { ok, message } untuk ditampilkan di bilah perintah. */
  function exec(r) {
    if (!r || !r.ok) return { ok: false, message: (r && r.error) || 'Perintah tidak dikenal' };
    const e = r.entity;
    switch (r.action) {
      case 'security':
        SecurityPage.open(e, r.tab || 'overview');
        App.showPage('security');
        return { ok: true, message: `${e.symbol} · ${r.tab || 'overview'}` };
      case 'country':
        CountryPage.open(iso3Of(e), r.tab === 'news' ? 'news' : 'overview');
        App.showPage('country');
        return { ok: true };
      case 'central_bank':
        App.showPage('macro'); scrollTo('.cb-card');
        return { ok: true, message: e.name + ': tabel bank sentral di halaman Makro' };
      case 'compare':
        if (r.mode === 'country') { CountryPage.compare(r.entities.map(iso3Of)); App.showPage('country'); return { ok: true }; }
        SecurityPage.compare(r.entities); App.showPage('security');
        return { ok: true };
      case 'news':
        if (e && e.type === 'country') { CountryPage.open(iso3Of(e), 'news'); App.showPage('country'); return { ok: true }; }
        if (e && ['stock', 'etf', 'index', 'crypto', 'fx', 'commodity', 'rate', 'company'].includes(e.type)) { SecurityPage.open(e, 'news'); App.showPage('security'); return { ok: true }; }
        App.showPage('news');
        NewsPage.search(e && e.type === 'topic' ? '' : (r.query || ''), e && e.type === 'topic' ? (TOPIC_CAT[e.id.split(':')[1]] || 'all') : 'all');
        return { ok: true };
      case 'people':
        if (has('people') && typeof PeoplePage !== 'undefined') { PeoplePage.open(e || null, r.query); App.showPage('people'); }
        else People.open(r.query || (e && e.name));
        return { ok: true };
      case 'watch': {
        const wl = Watchlists.active();
        const added = r.entities.filter(x => Watchlists.add(wl.id, x.id));
        return { ok: true, message: added.length ? `${added.map(x => x.symbol).join(', ')} ditambahkan ke "${wl.name}"` : `Sudah ada di "${wl.name}"` };
      }
      case 'unwatch': {
        const wl = Watchlists.active();
        r.entities.forEach(x => Watchlists.removeItem(wl.id, x.id));
        return { ok: true, message: `${r.entities.map(x => x.symbol).join(', ')} dihapus dari "${wl.name}"` };
      }
      case 'alert': {
        const a = Alerts.create(e, r.condition, r.canonical, 'perintah');
        return { ok: true, message: 'Alert dibuat: ' + a.text + '. Dicek tiap 30 detik memakai data nyata; tidak memicu bila data tidak tersedia.' };
      }
      case 'help': Help.open(r.topic); return { ok: true };
      case 'home': App.showPage('market'); return { ok: true };
      case 'clear':
        Store.set(HIST_KEY, []);
        Panels.restoreAll();
        return { ok: true, message: 'Riwayat perintah dikosongkan dan semua panel dipulihkan.' };
      case 'settings': $('#btnSettings').click(); return { ok: true };
      case 'screen':
        if (!has('screener')) return { ok: false, message: 'Screener belum tersedia di versi ini.' };
        App.showPage('screener'); if (typeof ScreenerPage !== 'undefined' && ScreenerPage.preset) ScreenerPage.preset(r.preset);
        return { ok: true };
      case 'heatmap':
        if (!has('heatmap')) return { ok: false, message: 'Heatmap belum tersedia di versi ini.' };
        App.showPage('heatmap'); if (typeof HeatmapPage !== 'undefined' && HeatmapPage.region) HeatmapPage.region(r.region);
        return { ok: true };
      case 'page': {
        /* halaman khusus (mis. rates, fx, cmdty) dipakai bila sudah ada; kalau belum, bagian di halaman Makro */
        const target = r.section && has(r.section) ? r.section : r.page === 'portfolio' && !has('portfolio') ? 'cash' : r.page;
        if (!has(target)) return { ok: false, message: 'Halaman belum tersedia: ' + r.page };
        App.showPage(target);
        if (target === 'ships' && r.target) ShipsPage.jump(r.target.symbol.toLowerCase());
        const SECTION = { rates: '.curve-card', cmdty: '.cmdty-card', regime: '.regime-card', cb: '.cb-card', stress: '.stress-card', curve: '.curve-card', fx: '.fx-card' };
        if (r.section && target === 'macro' && SECTION[r.section]) scrollTo(SECTION[r.section]);
        return { ok: true };
      }
      default: return { ok: false, message: 'Aksi belum didukung: ' + r.action };
    }
  }
  function run(text) {
    const r = Commands.parse(text, REG);
    if (!r.ok) {
      if (r.action !== 'search') ErrorLog.report('command', `${text}: ${r.error}`);
      return { ok: false, parsed: r, message: r.error };
    }
    let out;
    try { out = exec(r); }
    catch (err) {
      ErrorLog.report('command', `${text}: ${err.message}`, err.stack);
      return { ok: false, parsed: r, message: 'Perintah gagal dijalankan: ' + err.message };
    }
    if (out.ok) remember(r.canonical || text.trim());
    else ErrorLog.report('command', `${text}: ${out.message}`);
    return { ...out, parsed: r };
  }
  return { run, exec, history };
})();
