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

const NewsPage = (() => {
  const S = { cat: 'all', span: '24h', q: '', sel: null, list: [], res: null, sort: 'time' };
  let built = false, loadSeq = 0;
  async function load(force) {
    const my = ++loadSeq;                       // hanya respons permintaan terakhir yang boleh tampil
    const [, , query] = NEWS_CATS.find(c => c[0] === S.cat);
    $('#newsTable').innerHTML = '';
    $('#newsSrc').innerHTML = '<span class="loading">Mengambil berita dari GDELT</span>';
    const q = query + ' sourcelang:english';
    const p = new URLSearchParams({ query: q, mode: 'artlist', format: 'json', timespan: S.span, maxrecords: '200', sort: 'DateDesc' });
    const key = 'gdg:' + S.cat + ':' + S.span;
    if (force) { try { localStorage.removeItem('qtc.' + key); } catch { /* abaikan */ } }
    const r = await getData('gdelt', {
      server: '/api/gdelt/doc?' + new URLSearchParams({ query: q, mode: 'artlist', timespan: S.span, maxrecords: '200', sort: 'DateDesc' }),
      direct: 'https://api.gdeltproject.org/api/v2/doc/doc?' + p, parse: Parsers.parseGdeltArticles,
      ttl: force ? 0 : 10 * 60e3, persist: true, key, timeout: 35000,
    });
    if (my !== loadSeq) return;
    S.res = r;
    if (!r.ok) {
      S.list = [];
      $('#newsWrap').innerHTML = unavailableBox('Berita GDELT', r, 'GDELT gratis, tanpa kunci, tapi membatasi 1 permintaan per 5 detik per IP dan bisa menolak akses langsung dari browser. Jalankan server lokal (npm start) untuk jalur yang lebih andal.') + '<table class="dense news-table" id="newsTable"></table>';
      $('#newsSrc').innerHTML = '';
      $('#newsSide').innerHTML = '<p class="hint">Analisis dampak muncul setelah berita berhasil dimuat.</p>';
      return;
    }
    $('#newsWrap').innerHTML = '<table class="dense news-table" id="newsTable"></table>';   // buang kotak error lama
    const now = Date.now();
    S.list = r.data.map(n => ({ ...n, a: Analytics.analyzeHeadline(n.title, n.seen, now) }));
    render();
    $('#newsSrc').innerHTML = srcLine(r, `${S.list.length} judul unik · tema/sentimen/dampak = heuristik kata kunci`);
    if (!S.sel && S.list.length) { S.sel = [...S.list].sort((a, b) => b.a.impact - a.a.impact)[0].url; render(); side(); }
  }
  function filtered() {
    const q = S.q.trim().toLowerCase();
    let list = q ? S.list.filter(n => (n.title + ' ' + n.domain + ' ' + n.srcCountry).toLowerCase().includes(q)) : S.list.slice();
    if (S.sort === 'impact') list.sort((a, b) => b.a.impact - a.a.impact);
    return list;
  }
  function render() {
    const list = filtered();
    const sentCls = s => (s === 'positif' ? 'up' : s === 'negatif' ? 'down' : '');
    $('#newsTable').innerHTML = `<thead><tr><th scope="col"><button type="button" data-ns="time" ${S.sort === 'time' ? 'data-dir="desc"' : ''}>Waktu</button></th><th scope="col">Sumber</th><th scope="col">Judul</th><th scope="col">Negara sumber</th><th scope="col">Tema</th><th scope="col">Sentimen</th><th scope="col" class="num"><button type="button" data-ns="impact" ${S.sort === 'impact' ? 'data-dir="desc"' : ''}>Dampak</button></th></tr></thead><tbody>` +
      list.map(n => `<tr data-url="${esc(n.url)}" tabindex="0" aria-selected="${n.url === S.sel}">
        <td class="num">${esc(fmtTime(n.seen))}</td><td>${esc(n.domain.replace(/^www\./, '').slice(0, 24))}</td>
        <td class="wrap">${esc(n.title)}${n.a.speculative ? ' <span class="tpill spec">spekulatif</span>' : ''}</td>
        <td>${esc(n.srcCountry)}</td><td>${n.a.themes[0] ? `<span class="tpill ${n.a.themes[0].w >= 22 ? 'hot' : ''}">${esc(n.a.themes[0].label)}</span>` : '<span class="c-na">–</span>'}</td>
        <td class="${sentCls(n.a.sentiment.label)}">${esc(n.a.sentiment.label)}</td>
        <td class="num"><span class="heat" style="background:${n.a.impact > 60 ? 'rgb(255 111 97 / 0.3)' : n.a.impact > 35 ? 'rgb(224 177 90 / 0.22)' : 'transparent'}">${n.a.impact}</span></td></tr>`).join('') +
      (list.length ? '' : '<tr><td colspan="7" class="c-na">Tidak ada judul yang cocok dengan saringan.</td></tr>') + '</tbody>';
  }
  function side() {
    const n = S.list.find(x => x.url === S.sel);
    $('#newsSide').innerHTML = n ? impactPanel(n) : '<p class="hint">Pilih satu berita untuk melihat analisis dampaknya.</p>';
  }
  function build() {
    if (built) return;
    built = true;
    $('#newsCats').innerHTML = NEWS_CATS.map(([k, l]) => `<button type="button" data-cat="${k}" aria-pressed="${S.cat === k}">${l}</button>`).join('');
    $('#newsCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; S.cat = b.dataset.cat; S.sel = null; $$('#newsCats button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); load(); });
    $('#newsSpan').addEventListener('change', e => { S.span = e.target.value; S.sel = null; load(); });
    $('#newsQ').addEventListener('input', e => { S.q = e.target.value; render(); });
    $('#newsRefresh').addEventListener('click', () => load(true));
    $('#newsExport').addEventListener('click', () => download('berita.csv', toCsv([['waktu', 'sumber', 'judul', 'url', 'negara_sumber', 'tema', 'sentimen', 'dampak', 'spekulatif'], ...filtered().map(n => [n.seen, n.domain, n.title, n.url, n.srcCountry, n.a.themes.map(t => t.id).join('|'), n.a.sentiment.label, n.a.impact, n.a.speculative])]), 'text/csv'));
    $('#newsWrap').addEventListener('click', e => {
      const s = e.target.closest('[data-ns]'); if (s) { S.sort = s.dataset.ns; render(); return; }
      const tr = e.target.closest('tr[data-url]'); if (!tr) return;
      S.sel = tr.dataset.url; $$('#newsTable tbody tr').forEach(x => x.setAttribute('aria-selected', String(x === tr))); side();
    });
    $('#newsSide').addEventListener('click', e => {
      const c = e.target.closest('[data-country]'); if (c) { CountryPage.open(c.dataset.country, 'news'); App.showPage('country'); return; }
      const p = e.target.closest('[data-pick]'); if (p) bus.emit('pickSym', { sym: p.dataset.pick, go: true });
    });
  }
  return {
    show() { build(); if (!S.res) load(); },
    search(q, cat) { build(); if (cat) S.cat = cat; S.q = q || ''; $('#newsQ').value = S.q; $$('#newsCats button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.cat === S.cat))); load(); },
  };
})();
