/* =====================================================================
   TERMINAL BERITA (GDELT DOC 2.0): judul, sumber, waktu, tautan
   + tema, sentimen, skor dampak, rantai dampak (semua heuristik, berlabel)
   ===================================================================== */
const NEWS_CATS = [
  ['all', 'Semua penting', '(economy OR markets OR inflation OR "central bank" OR oil OR sanctions OR election OR tariff OR war OR recession)'],
  ['markets', 'Pasar', '(stocks OR "stock market" OR bonds OR "wall street" OR equities OR "bond yields")'],
  ['macro', 'Makro', '(inflation OR GDP OR "central bank" OR "interest rate" OR unemployment OR recession)'],
  ['politics', 'Politik', '(election OR parliament OR president OR "prime minister" OR coalition)'],
  ['geo', 'Geopolitik', '(sanctions OR military OR missile OR ceasefire OR invasion OR "border dispute" OR blockade)'],
  ['energy', 'Energi', '(oil OR OPEC OR "natural gas" OR LNG OR crude OR refinery OR pipeline)'],
  ['tech', 'Teknologi', '(semiconductor OR "artificial intelligence" OR chipmaker OR Nvidia OR TSMC)'],
  ['finance', 'Keuangan', '(bank OR "credit rating" OR default OR "private credit" OR downgrade)'],
  ['companies', 'Korporasi', '(earnings OR merger OR acquisition OR IPO OR "quarterly results")'],
  ['crypto', 'Kripto', '(bitcoin OR crypto OR ethereum OR stablecoin)'],
  ['shipping', 'Pelayaran', '(shipping OR tanker OR "Red Sea" OR "Strait of Hormuz" OR "Suez Canal" OR freight)'],
  ['indonesia', 'Indonesia', '(Indonesia OR rupiah OR "Bank Indonesia" OR Jakarta)'],
];
/* deteksi negara yang disebut di judul (nama + beberapa sebutan umum) */
const COUNTRY_ALIASES = {
  USA: ['united states', 'u.s.', ' us ', 'america', 'american', 'washington', 'white house', 'fed '], CHN: ['china', 'chinese', 'beijing'], RUS: ['russia', 'russian', 'moscow', 'kremlin'],
  JPN: ['japan', 'japanese', 'tokyo'], GBR: ['britain', 'british', ' uk ', 'u.k.', 'london', 'england'], IND: ['india', 'indian', 'new delhi'], SAU: ['saudi', 'riyadh'],
  IRN: ['iran', 'iranian', 'tehran'], ISR: ['israel', 'israeli'], UKR: ['ukraine', 'ukrainian', 'kyiv'], DEU: ['germany', 'german', 'berlin'], FRA: ['france', 'french', 'paris'],
  IDN: ['indonesia', 'indonesian', 'jakarta', 'rupiah'], TUR: ['turkey', 'turkish', 'türkiye', 'ankara'], BRA: ['brazil', 'brazilian'], MEX: ['mexico', 'mexican'],
  KOR: ['south korea', 'korean', 'seoul'], PRK: ['north korea', 'pyongyang'], TWN: ['taiwan', 'taiwanese', 'taipei'], VEN: ['venezuela'], ARG: ['argentina', 'argentine'],
  EGY: ['egypt', 'egyptian', 'cairo'], YEM: ['yemen', 'houthi'], PAK: ['pakistan'], NGA: ['nigeria'], ZAF: ['south africa'], AUS: ['australia', 'australian'], CAN: ['canada', 'canadian'],
  ITA: ['italy', 'italian'], ESP: ['spain', 'spanish'], VNM: ['vietnam', 'vietnamese'], THA: ['thailand', 'thai '], MYS: ['malaysia', 'malaysian'], PHL: ['philippines', 'philippine'], SGP: ['singapore'],
  QAT: ['qatar'], ARE: ['uae', 'emirates', 'dubai', 'abu dhabi'], IRQ: ['iraq'], SYR: ['syria'], LBN: ['lebanon'], PSE: ['gaza', 'palestin', 'west bank'],
};
function detectCountries(title) {
  const t = ' ' + String(title).toLowerCase().replace(/[“”"']/g, ' ') + ' ';
  const out = new Set();
  for (const [iso, al] of Object.entries(COUNTRY_ALIASES)) if (al.some(a => t.includes(a))) out.add(iso);
  for (const c of COUNTRIES) if (c.en.length > 4 && t.includes(' ' + c.en.toLowerCase())) out.add(c.iso3);
  return [...out].slice(0, 6);
}
const GENERIC_WORDS = new Set(['bank', 'united', 'global', 'international', 'group', 'china']);
function detectAssets(title) {
  const t = String(title).toLowerCase();
  return STOCKS.filter(i => {
    const w = i.name.toLowerCase().split(' ')[0];
    return (w.length >= 4 && !GENERIC_WORDS.has(w) && new RegExp('\\b' + w + '\\b').test(t)) || (i.sym.length > 2 && /^[a-z]+$/i.test(i.sym) && new RegExp('\\b' + i.sym.toLowerCase() + '\\b').test(t));
  }).map(i => i.sym).slice(0, 6);
}

function impactPanel(n) {
  const a = n.a || Analytics.analyzeHeadline(n.title, n.seen);
  const chain = Analytics.CHAINS[a.primary];
  const cs = detectCountries(n.title).map(i => C3.get(i)).filter(Boolean);
  const assets = detectAssets(n.title);
  return `
    <div><a class="item-title" style="font-size:14px" href="${safeUrl(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
      <div class="item-meta"><span>${esc(n.domain)}</span><span>${esc(fmtTime(n.seen))}</span><span>${esc(n.srcCountry || '')}</span>${qBadge('delayed', 'GDELT memantau berita dengan jeda ±15 menit')}</div></div>
    <div><h3>Skor dampak ${qBadge('calculated')}</h3>
      <div class="bigscore"><strong>${a.impact}</strong><span class="meta">dari 100 · tema ${a.impactParts.tema} + kata keras ${a.impactParts.kataKeras} + kebaruan ${a.impactParts.kebaruan}</span></div>
      <div class="meter"><i style="width:${a.impact}%;background:${a.impact > 60 ? 'var(--down)' : a.impact > 35 ? 'var(--brass)' : 'var(--ink-3)'}"></i></div></div>
    <div><h3>Kenapa ini penting</h3>
      <p class="lead">${a.themes.length ? 'Judul menyentuh tema ' + a.themes.map(t => `<b>${esc(t.label.toLowerCase())}</b> (kata: ${esc(t.matched.join(', '))})`).join(', ') + '.' : 'Tidak ada tema ekonomi yang dikenali dari kata kunci judul.'}
      ${a.impactParts.kata.length ? ' Kata bernada keras: ' + esc(a.impactParts.kata.join(', ')) + '.' : ''}
      ${a.speculative ? ' Judul bersifat <b>spekulatif</b> (' + esc(a.specWords.slice(0, 3).join(', ')) + '): ini perkiraan, belum tentu terjadi.' : ''}
      Sentimen leksikon: <b>${esc(a.sentiment.label)}</b>.</p></div>
    <div><h3>Negara dan aset yang disebut</h3>
      <div class="pillset">${cs.map(c => `<button type="button" class="mini-btn" data-country="${c.iso3}">${esc(c.name)}</button>`).join('') || '<span class="hint">Tidak ada nama negara terdeteksi di judul.</span>'}
      ${assets.map(s => `<button type="button" class="mini-btn" data-pick="${s}">${esc(s)}</button>`).join('')}</div></div>
    ${chain ? `<div><h3>Kemungkinan rantai dampak ${qBadge('inference')}</h3>
      <ol class="chain">${chain.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${chain.sectors.length ? `<p class="lead">Sektor: ${chain.sectors.map(([s, d]) => `${esc(s)} <b>${esc(d)}</b>`).join(' · ')}</p>` : ''}
      <p class="lead">Aset yang biasanya ikut bereaksi: ${esc(chain.assets.join(', '))}.</p>
      <p class="lead">Efek lanjutan: ${esc(chain.second)}</p></div>` : ''}
    <p class="disclaimer">Analisis di atas dihitung dari kata kunci judul dan aturan umum ekonomi. Itu inferensi, bukan bukti sebab-akibat, dan bukan nasihat investasi. Baca artikelnya sebelum menyimpulkan.</p>`;
}

/* Terminal berita: kategori tetap ATAU kueri bebas GDELT (perintah "N RUPIAH"), tampilan Breaking /
   Terbaru / Paling relevan, saringan tema/negara sumber/domain/spekulatif, dan penggabungan judul
   yang hampir sama (logika murni di shared/newsrank.mjs). Tema, sentimen, dan skor dampak = Analisis
   otomatis (heuristik kata kunci), bukan fakta. */
const NewsPage = (() => {
  const S = { cat: 'all', span: '24h', q: '', gq: '', sel: null, list: [], raw: 0, res: null, view: 'time', f: { theme: '', country: '', domain: '', spec: false } };
  let built = false, loadSeq = 0;
  const VIEW_LABEL = { breaking: 'Breaking (2 jam terakhir)', time: 'Terbaru', impact: 'Paling relevan (skor dampak heuristik)' };
  async function load(force) {
    const my = ++loadSeq;                       // hanya respons permintaan terakhir yang boleh tampil
    const alive = () => my === loadSeq;
    const gq = S.gq ? Newsrank.queryFor(S.gq) : null;
    const query = gq || NEWS_CATS.find(c => c[0] === S.cat)[2];
    $('#newsTable').innerHTML = '';
    $('#newsSrc').innerHTML = '<span class="loading">Mengambil berita dari GDELT</span>';
    $('#newsMode').textContent = gq ? 'Kueri GDELT: ' + gq : '';
    $('#newsGqClear').hidden = !gq;
    const q = query + ' sourcelang:english';
    const p = new URLSearchParams({ query: q, mode: 'artlist', format: 'json', timespan: S.span, maxrecords: '200', sort: 'DateDesc' });
    const key = gq ? 'gdq:' + gq.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60) + ':' + S.span : 'gdg:' + S.cat + ':' + S.span;
    if (force) { try { localStorage.removeItem('qtc.' + key); } catch { /* abaikan */ } }
    const r = await getData('gdelt', {
      server: '/api/gdelt/doc?' + new URLSearchParams({ query: q, mode: 'artlist', timespan: S.span, maxrecords: '200', sort: 'DateDesc' }),
      direct: 'https://api.gdeltproject.org/api/v2/doc/doc?' + p, parse: Parsers.parseGdeltArticles,
      ttl: force ? 0 : 10 * 60e3, persist: !gq, key, timeout: 35000, alive,
    });
    if (!alive()) return;
    S.res = r;
    if (!r.ok) {
      S.list = []; S.raw = 0;
      $('#newsWrap').innerHTML = unavailableBox('Berita GDELT' + (gq ? ' untuk ' + gq : ''), r, 'GDELT gratis, tanpa kunci, tapi membatasi 1 permintaan per 5 detik per IP dan bisa menolak akses langsung dari browser. Jalankan server lokal (npm start) untuk jalur yang lebih andal.') + '<table class="dense news-table" id="newsTable"></table>';
      $('#newsSrc').innerHTML = '';
      $('#newsSide').innerHTML = '<p class="hint">Analisis dampak muncul setelah berita berhasil dimuat.</p>';
      facets();
      return;
    }
    $('#newsWrap').innerHTML = '<table class="dense news-table" id="newsTable"></table>';   // buang kotak error lama
    const now = Date.now();
    S.raw = r.data.length;
    S.list = Newsrank.dedupe(r.data).map(n => ({ ...n, a: Analytics.analyzeHeadline(n.title, n.seen, now) }));
    facets();
    if (S.sel && !S.list.some(n => n.url === S.sel)) S.sel = null;
    if (!S.sel && S.list.length) S.sel = Newsrank.sortNews(S.list, 'impact')[0].url;
    render(); side();
  }
  function filtered() {
    const base = S.view === 'breaking' ? Newsrank.breaking(S.list) : Newsrank.sortNews(S.list, S.view === 'impact' ? 'impact' : 'time');
    return Newsrank.filterNews(base, { ...S.f, text: S.q });
  }
  /* pilihan saringan dari data yang dimuat; pilihan yang tidak ada lagi dikosongkan */
  function facets() {
    const fill = (sel, items, all, lbl) => {
      const el = $(sel), cur = el.value;
      el.innerHTML = `<option value="">${esc(all)}</option>` + items.map(([v, n]) => `<option value="${esc(v)}">${esc(lbl ? lbl(v) : v)} (${n})</option>`).join('');
      el.value = items.some(([v]) => v === cur) ? cur : '';
    };
    fill('#newsFTheme', Newsrank.facet(S.list, n => n.a.themes.map(t => t.id)), 'Semua tema', v => (Analytics.THEMES[v] || { label: v }).label);
    fill('#newsFCountry', Newsrank.facet(S.list, n => n.srcCountry), 'Semua negara sumber');
    fill('#newsFDomain', Newsrank.facet(S.list, n => n.domain).slice(0, 60), 'Semua domain');
    S.f.theme = $('#newsFTheme').value; S.f.country = $('#newsFCountry').value; S.f.domain = $('#newsFDomain').value;
  }
  function render() {
    const list = filtered();
    const sentCls = s => (s === 'positif' ? 'up' : s === 'negatif' ? 'down' : '');
    $('#newsTable').innerHTML = `<caption class="sr">Berita: ${esc(VIEW_LABEL[S.view])}</caption><thead><tr><th scope="col">Waktu</th><th scope="col">Sumber</th><th scope="col">Judul</th><th scope="col">Negara sumber</th><th scope="col">Tema ${qBadge('inference', 'Analisis otomatis: heuristik kata kunci judul')}</th><th scope="col">Sentimen ${qBadge('inference', 'Analisis otomatis: leksikon kata, bukan fakta')}</th><th scope="col" class="num">Dampak ${qBadge('calculated', 'Skor heuristik 0-100, bukan fakta')}</th></tr></thead><tbody>` +
      list.map(n => `<tr data-url="${esc(n.url)}" tabindex="0" aria-selected="${n.url === S.sel}">
        <td class="num">${esc(fmtTime(n.seen))}</td><td>${esc(n.domain.replace(/^www\./, '').slice(0, 24))}</td>
        <td class="wrap">${esc(n.title)}${n.a.speculative ? ' <span class="tpill spec">spekulatif</span>' : ''}${n.dupes.length ? ` <span class="tpill dup" data-dupes title="${esc('Judul serupa dari: ' + n.dupes.map(d => d.domain).join(', '))}">+${n.dupes.length} sumber lain</span>` : ''}</td>
        <td>${esc(n.srcCountry)}</td><td>${n.a.themes[0] ? `<span class="tpill ${n.a.themes[0].w >= 22 ? 'hot' : ''}">${esc(n.a.themes[0].label)}</span>` : '<span class="c-na">–</span>'}</td>
        <td class="${sentCls(n.a.sentiment.label)}">${esc(n.a.sentiment.label)}</td>
        <td class="num"><span class="heat" style="background:${n.a.impact > 60 ? 'rgb(255 111 97 / 0.3)' : n.a.impact > 35 ? 'rgb(224 177 90 / 0.22)' : 'transparent'}">${n.a.impact}</span></td></tr>`).join('') +
      (list.length ? '' : `<tr><td colspan="7" class="c-na">${S.view === 'breaking' && S.list.length ? 'Tidak ada judul dalam 2 jam terakhir (GDELT memantau dengan jeda ±15 menit). Pilih Terbaru untuk semua judul.' : 'Tidak ada judul yang cocok dengan saringan.'}</td></tr>`) + '</tbody>';
    if (S.res && S.res.ok) {
      const merged = S.raw - S.list.length;
      $('#newsSrc').innerHTML = srcLine(S.res, `${VIEW_LABEL[S.view]} · ${list.length} tampil dari ${S.list.length} judul unik${merged > 0 ? ` (${merged} judul serupa digabung)` : ''} · tema/sentimen/dampak = Analisis otomatis (heuristik kata kunci)`);
    }
  }
  function side() {
    const n = S.list.find(x => x.url === S.sel);
    $('#newsSide').innerHTML = n ? impactPanel(n) + (n.dupes.length ? `<div><h3>Judul serupa dari sumber lain (${n.dupes.length})</h3><ul class="dupe-list">${n.dupes.map(d => `<li><a href="${safeUrl(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a> <span class="meta">${esc(d.domain)} · ${esc(fmtTime(d.seen))}</span></li>`).join('')}</ul><p class="hint">Digabung otomatis karena kata-kata judulnya hampir sama (kemiripan ≥ 60%). Yang ditampilkan di tabel adalah yang paling awal.</p></div>` : '') : '<p class="hint">Pilih satu berita untuk melihat analisis dampaknya.</p>';
  }
  function setView(v) { S.view = v; Store.set('newsView', v); $$('#newsView [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v))); render(); }
  function build() {
    if (built) return;
    built = true;
    $('#newsCats').innerHTML = NEWS_CATS.map(([k, l]) => `<button type="button" data-cat="${k}" aria-pressed="${S.cat === k}">${l}</button>`).join('');
    $('#newsCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; S.cat = b.dataset.cat; S.gq = ''; $('#newsGq').value = ''; S.sel = null; $$('#newsCats button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); load(); });
    $('#newsSpan').addEventListener('change', e => { S.span = e.target.value; S.sel = null; load(); });
    $('#newsQ').addEventListener('input', e => { S.q = e.target.value; render(); });
    $('#newsGqForm').addEventListener('submit', e => {
      e.preventDefault();
      const v = $('#newsGq').value.trim();
      if (!Newsrank.queryFor(v)) { $('#newsMode').textContent = 'Kueri minimal 3 huruf (huruf, angka, spasi, tanda hubung).'; return; }
      S.gq = v; S.sel = null; $$('#newsCats button').forEach(x => x.setAttribute('aria-pressed', 'false')); load();
    });
    $('#newsGqClear').addEventListener('click', () => { S.gq = ''; $('#newsGq').value = ''; S.sel = null; $$('#newsCats button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.cat === S.cat))); load(); });
    $('#newsView').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
    $('#newsFTheme').addEventListener('change', e => { S.f.theme = e.target.value; render(); });
    $('#newsFCountry').addEventListener('change', e => { S.f.country = e.target.value; render(); });
    $('#newsFDomain').addEventListener('change', e => { S.f.domain = e.target.value; render(); });
    $('#newsFSpec').addEventListener('change', e => { S.f.spec = e.target.checked; render(); });
    $('#newsRefresh').addEventListener('click', () => load(true));
    $('#newsExport').addEventListener('click', () => download('berita.csv', toCsv([['waktu', 'sumber', 'judul', 'url', 'negara_sumber', 'tema', 'sentimen', 'dampak', 'spekulatif', 'sumber_serupa'], ...filtered().map(n => [n.seen, n.domain, n.title, n.url, n.srcCountry, n.a.themes.map(t => t.id).join('|'), n.a.sentiment.label, n.a.impact, n.a.speculative, n.dupes.map(d => d.domain).join('|')])]), 'text/csv'));
    $('#newsWrap').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-url]'); if (!tr) return;
      S.sel = tr.dataset.url; $$('#newsTable tbody tr').forEach(x => x.setAttribute('aria-selected', String(x === tr))); side();
    });
    $('#newsWrap').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-url]')) e.target.click(); });
    $('#newsSide').addEventListener('click', e => {
      const c = e.target.closest('[data-country]'); if (c) { CountryPage.open(c.dataset.country, 'news'); App.showPage('country'); return; }
      const p = e.target.closest('[data-pick]'); if (p) bus.emit('pickSym', { sym: p.dataset.pick, go: true });
    });
    const v = Store.get('newsView', 'time');
    if (VIEW_LABEL[v]) setView(v);
  }
  return {
    show() { build(); if (!S.res) load(); },
    /* q = kueri GDELT baru (mis. dari "N RUPIAH"); kosong = kategori cat */
    search(q, cat) {
      build();
      if (cat) S.cat = cat;
      S.gq = q && Newsrank.queryFor(q) ? String(q).trim() : '';
      S.q = ''; $('#newsQ').value = ''; $('#newsGq').value = S.gq; S.sel = null;
      $$('#newsCats button').forEach(x => x.setAttribute('aria-pressed', String(!S.gq && x.dataset.cat === S.cat)));
      load();
    },
    get state() { return { view: S.view, gq: S.gq, cat: S.cat, unique: S.list.length, raw: S.raw, shown: S.res && S.res.ok ? filtered().length : 0 }; },
  };
})();
