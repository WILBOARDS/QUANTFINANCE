/* =====================================================================
   ANALITIK TRANSPARAN (dipakai browser dan diuji di Node)
   Semua fungsi di sini MENGHITUNG dari data nyata yang diberikan.
   Hasilnya selalu disertai komponen/alasan supaya bisa diperiksa.
   Yang berbasis kata kunci (tema, sentimen, spekulasi) itu heuristik kasar,
   bukan pemahaman bahasa; label di UI wajib menyebutnya begitu.
   ===================================================================== */

/* ---------- tema berita (kata kunci Inggris + Indonesia) ---------- */
export const THEMES = {
  monetary: { label: 'Bank sentral dan suku bunga', w: 25, kw: ['central bank', 'rate cut', 'rate hike', 'interest rate', 'rates', 'federal reserve', 'the fed', 'fed', 'fomc', 'ecb', 'boj', 'bank of japan', 'bank of england', 'pboc', 'bank indonesia', 'bi rate', 'policy rate', 'monetary', 'suku bunga', 'bank sentral', 'powell', 'lagarde'] },
  inflation: { label: 'Inflasi dan harga', w: 20, kw: ['inflation', 'cpi', 'consumer prices', 'price index', 'ppi', 'inflasi', 'deflation', 'deflasi', 'cost of living'] },
  growth: { label: 'Pertumbuhan ekonomi', w: 15, kw: ['gdp', 'economic growth', 'recession', 'economy', 'economic', 'pmi', 'industrial output', 'pertumbuhan', 'resesi', 'ekonomi', 'slowdown', 'stimulus'] },
  jobs: { label: 'Tenaga kerja', w: 12, kw: ['jobs', 'unemployment', 'payrolls', 'labor market', 'labour market', 'layoffs', 'pengangguran', 'tenaga kerja', 'phk', 'wages', 'upah'] },
  fiscal: { label: 'Fiskal dan utang', w: 15, kw: ['budget', 'deficit', 'public debt', 'government debt', 'bond', 'treasury', 'tax', 'fiscal', 'apbn', 'utang', 'pajak', 'defisit', 'obligasi', 'sbn', 'imf loan', 'bailout'] },
  trade: { label: 'Perdagangan dan tarif', w: 18, kw: ['tariff', 'trade war', 'trade deal', 'exports', 'imports', 'export', 'import', 'trade', 'ekspor', 'impor', 'tarif', 'perdagangan', 'wto', 'supply chain'] },
  sanctions: { label: 'Sanksi', w: 25, kw: ['sanction', 'embargo', 'blacklist', 'export controls', 'sanksi', 'price cap'] },
  conflict: { label: 'Konflik dan militer', w: 30, kw: ['war', 'attack', 'missile', 'airstrike', 'air strike', 'drone strike', 'military', 'troops', 'invasion', 'ceasefire', 'conflict', 'shelling', 'perang', 'serangan', 'militer', 'konflik', 'rudal', 'gencatan senjata', 'hostage', 'militant'] },
  politics: { label: 'Politik dan pemilu', w: 12, kw: ['election', 'vote', 'parliament', 'president', 'prime minister', 'cabinet', 'coalition', 'impeach', 'pemilu', 'pilkada', 'presiden', 'parlemen', 'dpr', 'menteri', 'kabinet', 'referendum', 'coup', 'kudeta'] },
  unrest: { label: 'Protes dan kerusuhan', w: 12, kw: ['protest', 'riot', 'demonstration', 'unrest', 'clashes', 'demo', 'kerusuhan', 'unjuk rasa', 'demonstran', 'general strike', 'mogok'] },
  energy: { label: 'Energi', w: 22, kw: ['oil', 'crude', 'brent', 'wti', 'natural gas', 'lng', 'opec', 'energy', 'fuel', 'coal', 'power grid', 'electricity', 'refinery', 'pipeline', 'minyak', 'energi', 'bbm', 'batu bara', 'listrik', 'nuclear plant'] },
  shipping: { label: 'Pelayaran dan logistik', w: 18, kw: ['shipping', 'port', 'tanker', 'vessel', 'canal', 'strait', 'freight', 'container ship', 'red sea', 'hormuz', 'suez', 'panama canal', 'malacca', 'houthi', 'pelabuhan', 'kapal', 'selat', 'logistik'] },
  currency: { label: 'Mata uang', w: 15, kw: ['currency', 'dollar', 'rupiah', 'yen', 'yuan', 'renminbi', 'euro', 'exchange rate', 'forex', 'devaluation', 'peso', 'lira', 'rupee', 'kurs', 'nilai tukar', 'dxy'] },
  markets: { label: 'Pasar saham', w: 10, kw: ['stocks', 'shares', 'stock market', 'index', 'rally', 'selloff', 'sell-off', 'equities', 'bourse', 'nasdaq', 's&p 500', 'dow jones', 'saham', 'ihsg', 'bursa', 'wall street', 'ipo'] },
  tech: { label: 'Teknologi', w: 8, kw: ['ai', 'artificial intelligence', 'chip', 'semiconductor', 'nvidia', 'software', 'data center', 'teknologi', 'cyber'] },
  crypto: { label: 'Kripto', w: 8, kw: ['bitcoin', 'crypto', 'ethereum', 'stablecoin', 'kripto', 'blockchain', 'etf bitcoin'] },
  disaster: { label: 'Bencana alam', w: 15, kw: ['earthquake', 'flood', 'typhoon', 'hurricane', 'cyclone', 'wildfire', 'volcano', 'tsunami', 'drought', 'gempa', 'banjir', 'topan', 'letusan', 'kekeringan'] },
  credit: { label: 'Peringkat dan kredit', w: 20, kw: ['downgrade', 'upgrade', 'credit rating', 'default', "moody's", 'moodys', 'fitch', 's&p global ratings', 'gagal bayar', 'insolvency', 'bankruptcy', 'bangkrut'] },
  corporate: { label: 'Korporasi', w: 8, kw: ['earnings', 'profit', 'revenue', 'merger', 'acquisition', 'takeover', 'guidance', 'quarterly results', 'laba', 'akuisisi', 'dividend', 'dividen'] },
};
export const SEVERE = ['war', 'invasion', 'default', 'crisis', 'emergency', 'collapse', 'blockade', 'closure', 'shut', 'surge', 'plunge', 'crash', 'record', 'escalat', 'nuclear', 'perang', 'krisis', 'darurat', 'anjlok', 'melonjak', 'rekor', 'ditutup'];
const SPEC = ['might', 'could', 'would', 'likely', 'unlikely', 'expected to', 'expects', 'expectations', 'forecast', 'predict', 'projected', 'poised to', 'set to', 'plans to', 'planning', 'considering', 'weighs', 'mulls', 'eyes', 'fears', 'risk of', 'warns', 'warning', 'rumor', 'rumour', 'speculat', 'sources say', 'reportedly', 'possible', 'potential', 'outlook', 'bets', 'odds', 'what to expect', 'scenario', 'if', '?',
  'akan', 'diperkirakan', 'diprediksi', 'berpotensi', 'kemungkinan', 'berencana', 'rencana', 'isu', 'spekulasi', 'dikabarkan', 'proyeksi', 'prospek', 'ancaman', 'diproyeksikan', 'disebut-sebut', 'bakal'];
const POS = ['surge', 'soar', 'rally', 'gain', 'rise', 'rises', 'rising', 'jump', 'record high', 'beat', 'beats', 'growth', 'boost', 'recover', 'rebound', 'upgrade', 'strong', 'optimism', 'deal', 'agreement', 'ceasefire', 'eases', 'easing', 'surplus', 'expands', 'approve', 'wins',
  'naik', 'menguat', 'melonjak', 'tumbuh', 'rekor', 'optimis', 'pulih', 'kesepakatan', 'surplus', 'untung'];
const NEG = ['fall', 'falls', 'drop', 'plunge', 'slump', 'crash', 'loss', 'losses', 'recession', 'crisis', 'war', 'attack', 'sanction', 'default', 'downgrade', 'weak', 'fears', 'concern', 'protest', 'layoffs', 'deficit', 'shortage', 'slows', 'slowdown', 'cut jobs', 'tumble', 'sink', 'warns', 'threat', 'kill', 'dead', 'death', 'collapse', 'bankrupt',
  'turun', 'anjlok', 'melemah', 'krisis', 'perang', 'resesi', 'defisit', 'gagal', 'phk', 'rugi', 'ancaman', 'tewas', 'merosot', 'bangkrut'];

const norm = s => ' ' + String(s || '').toLowerCase().replace(/[“”"']/g, ' ').replace(/\s+/g, ' ') + ' ';
/* pencocokan kata utuh: kata pendek (<=4 huruf) harus utuh (boleh +s/es), kata panjang boleh
   berimbuhan di belakang (sanction -> sanctions). Mencegah "war" cocok dengan "warns". */
const _re = new Map();
function kwRe(k) {
  let r = _re.get(k);
  if (!r) {
    const w = k.trim();
    const e = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (w === '?') r = /\?/;
    else if (/^[a-zà-ÿ]+$/i.test(w)) r = new RegExp('(^|[^a-zà-ÿ0-9])' + e + (w.length <= 4 ? '(s|es)?(?![a-zà-ÿ0-9])' : ''), 'i');
    else r = new RegExp('(^|[^a-zà-ÿ0-9])' + e + '(?![a-zà-ÿ0-9])', 'i');
    _re.set(k, r);
  }
  return r;
}
const hits = (t, list) => list.filter(k => kwRe(k).test(t));

export function analyzeHeadline(title, seenIso, now = Date.now()) {
  const t = norm(title);
  const themes = [];
  for (const [id, th] of Object.entries(THEMES)) {
    const h = hits(t, th.kw);
    if (h.length) themes.push({ id, label: th.label, w: th.w, matched: h.slice(0, 3) });
  }
  themes.sort((a, b) => b.w - a.w);
  const pos = hits(t, POS), neg = hits(t, NEG);
  const sent = pos.length + neg.length ? (pos.length - neg.length) / (pos.length + neg.length) : 0;
  const spec = hits(t, SPEC);
  const sev = hits(t, SEVERE);
  /* skor dampak 0-100: bobot 2 tema terkuat + kata keras + kebaruan. Semua komponen dikembalikan. */
  const themePts = themes.slice(0, 2).reduce((a, x, i) => a + x.w * (i ? 0.6 : 1), 0);
  const sevPts = Math.min(sev.length * 8, 20);
  const ageH = seenIso ? (now - Date.parse(seenIso)) / 3.6e6 : null;
  const recPts = ageH === null ? 0 : ageH < 3 ? 10 : ageH < 12 ? 5 : 0;
  const impact = Math.max(0, Math.min(100, Math.round(themePts + sevPts + recPts)));
  return {
    themes, primary: themes[0] ? themes[0].id : 'other',
    sentiment: { score: sent, label: sent > 0.2 ? 'positif' : sent < -0.2 ? 'negatif' : 'netral', pos, neg },
    speculative: spec.length > 0, specWords: spec.map(s => s.trim()),
    impact, impactParts: { tema: Math.round(themePts), kataKeras: sevPts, kebaruan: recPts, kata: sev },
  };
}

/* kumpulan judul -> ringkasan isu: tema terbanyak, judul spekulatif, rata-rata sentimen */
export function summarizeNews(articles, now = Date.now()) {
  const counts = {};
  const spec = [];
  let sSum = 0, sN = 0;
  const analyzed = articles.map(a => {
    const x = analyzeHeadline(a.title, a.seen, now);
    for (const th of x.themes) (counts[th.id] ||= { id: th.id, label: th.label, n: 0, examples: [] }).n++;
    if (x.themes[0]) { const c = counts[x.themes[0].id]; if (c.examples.length < 3) c.examples.push(a.title); }
    if (x.speculative) spec.push({ ...a, a: x });
    if (x.sentiment.pos.length + x.sentiment.neg.length) { sSum += x.sentiment.score; sN++; }
    return { ...a, a: x };
  });
  const themes = Object.values(counts).sort((a, b) => b.n - a.n);
  spec.sort((a, b) => b.a.impact - a.a.impact);
  return { analyzed, themes, speculative: spec, sentiment: sN ? sSum / sN : null, sentimentN: sN, total: articles.length };
}

/* ---------- rantai dampak (inferensi aturan umum, BUKAN sebab-akibat pasti) ---------- */
export const CHAINS = {
  energy: { steps: ['Harga minyak/gas', 'Ekspektasi inflasi', 'Ekspektasi suku bunga bank sentral', 'Imbal hasil obligasi', 'Valuasi saham'], sectors: [['Produsen energi', '+'], ['Maskapai', '−'], ['Kimia/petrokimia', '−'], ['Pelayaran tanker', '+/−']], assets: ['Brent', 'WTI', 'Mata uang importir minyak', 'Mata uang eksportir minyak'], second: 'Negara importir minyak menanggung defisit transaksi berjalan lebih besar; subsidi BBM bisa menekan APBN.' },
  shipping: { steps: ['Gangguan rute/selat', 'Ongkos angkut dan asuransi', 'Waktu kirim lebih lama', 'Inflasi barang', 'Margin peritel'], sectors: [['Perusahaan pelayaran', '+ (tarif angkut)'], ['Peritel/importir', '−'], ['Asuransi laut', '−']], assets: ['Indeks ongkos angkut', 'Minyak (bila Hormuz/Bab el-Mandeb)'], second: 'Rantai pasok bergeser; stok pengaman naik; inflasi barang impor.' },
  monetary: { steps: ['Ekspektasi suku bunga', 'Imbal hasil obligasi', 'Dolar AS', 'Mata uang negara berkembang', 'Saham pertumbuhan'], sectors: [['Bank (margin bunga)', '+ bila naik'], ['Properti', '− bila naik'], ['Teknologi bervaluasi tinggi', '− bila naik']], assets: ['US2Y', 'US10Y', 'DXY', 'Emas'], second: 'Arus modal ke/dari negara berkembang berubah; kurs dan cadangan devisa ikut terdampak.' },
  inflation: { steps: ['Data inflasi', 'Ekspektasi suku bunga', 'Imbal hasil', 'Valuasi saham'], sectors: [['Konsumer non-primer', '−'], ['Komoditas', '+']], assets: ['Obligasi indeks inflasi', 'US10Y', 'Emas'], second: 'Daya beli turun; bank sentral bisa menahan pelonggaran.' },
  conflict: { steps: ['Eskalasi konflik', 'Selera risiko turun (risk-off)', 'Aset aman naik', 'Mata uang berisiko turun'], sectors: [['Pertahanan', '+'], ['Maskapai/pariwisata', '−'], ['Energi', '+ bila dekat produsen']], assets: ['Emas', 'USD', 'JPY', 'CHF', 'Minyak'], second: 'Sanksi, gangguan pasokan, dan lonjakan biaya asuransi bisa menyusul.' },
  sanctions: { steps: ['Sanksi/embargo', 'Arus dagang dialihkan', 'Pasokan komoditas berubah', 'Harga komoditas'], sectors: [['Eksportir terdampak', '−'], ['Pesaing pemasok pengganti', '+']], assets: ['Komoditas terkait', 'Mata uang negara tersanksi'], second: 'Rute pelayaran dan sistem pembayaran alternatif berkembang.' },
  trade: { steps: ['Tarif/hambatan dagang', 'Biaya impor', 'Volume ekspor', 'Pertumbuhan dan kurs'], sectors: [['Eksportir', '−'], ['Produsen dalam negeri pesaing impor', '+'], ['Peritel', '−']], assets: ['Mata uang negara pengekspor', 'Indeks saham pengekspor'], second: 'Relokasi rantai pasok; negara ketiga bisa diuntungkan.' },
  currency: { steps: ['Pelemahan mata uang', 'Harga impor naik', 'Inflasi', 'Respons bank sentral'], sectors: [['Eksportir', '+'], ['Perusahaan berutang valas', '−'], ['Importir', '−']], assets: ['Kurs', 'Obligasi pemerintah', 'Cadangan devisa'], second: 'Bank sentral bisa intervensi pasar valas atau menaikkan bunga.' },
  fiscal: { steps: ['Defisit/utang', 'Pasokan obligasi', 'Imbal hasil naik', 'Biaya pinjaman swasta'], sectors: [['Bank pemegang obligasi', '−'], ['Konstruksi (belanja pemerintah)', '+/−']], assets: ['Obligasi pemerintah', 'Mata uang', 'CDS negara'], second: 'Peringkat kredit bisa ditinjau; investor asing bisa keluar.' },
  credit: { steps: ['Perubahan peringkat/gagal bayar', 'Premi risiko', 'Imbal hasil dan kurs'], sectors: [['Bank', '−'], ['Penerbit obligasi korporasi', '−']], assets: ['Obligasi', 'Mata uang', 'Indeks saham'], second: 'Penularan ke penerbit lain di negara/sektor yang sama.' },
  politics: { steps: ['Ketidakpastian kebijakan', 'Premi risiko', 'Volatilitas kurs dan saham'], sectors: [['Sektor teregulasi (BUMN, energi, bank)', '+/−']], assets: ['Mata uang', 'Indeks saham', 'Obligasi'], second: 'Arah kebijakan fiskal dan investasi asing bisa berubah setelah hasil diketahui.' },
  unrest: { steps: ['Protes/kerusuhan', 'Gangguan aktivitas ekonomi', 'Premi risiko negara'], sectors: [['Ritel dan pariwisata', '−']], assets: ['Mata uang', 'Indeks saham lokal'], second: 'Pemerintah bisa mengubah kebijakan (subsidi, pajak) sebagai respons.' },
  disaster: { steps: ['Bencana', 'Gangguan produksi/logistik setempat', 'Pasokan komoditas', 'Harga'], sectors: [['Asuransi', '−'], ['Konstruksi', '+ (pemulihan)'], ['Pertanian/tambang setempat', '−']], assets: ['Komoditas yang diproduksi di wilayah itu'], second: 'Belanja rekonstruksi bisa menambah defisit fiskal.' },
  growth: { steps: ['Data pertumbuhan', 'Ekspektasi laba perusahaan', 'Ekspektasi kebijakan'], sectors: [['Siklikal', '+ bila kuat'], ['Defensif', '+ bila lemah']], assets: ['Indeks saham', 'Obligasi', 'Komoditas industri'], second: 'Bank sentral dan pemerintah menyesuaikan stimulus.' },
  jobs: { steps: ['Data tenaga kerja', 'Ekspektasi upah dan konsumsi', 'Ekspektasi suku bunga'], sectors: [['Konsumer', '+/−']], assets: ['US2Y', 'USD', 'Indeks saham'], second: 'Kekuatan pasar kerja memengaruhi inflasi jasa.' },
  tech: { steps: ['Berita teknologi/AI', 'Ekspektasi permintaan chip dan pusat data', 'Valuasi sektor teknologi'], sectors: [['Semikonduktor', '+/−'], ['Utilitas listrik', '+ (permintaan daya)']], assets: ['Nasdaq', 'Saham chip'], second: 'Rantai pasok chip (Taiwan, Korea, Belanda) ikut sensitif.' },
  crypto: { steps: ['Berita kripto', 'Selera risiko kripto', 'Harga dan volume'], sectors: [['Bursa kripto', '+/−']], assets: ['BTC', 'ETH'], second: 'Regulasi dan arus ETF memengaruhi likuiditas.' },
  markets: { steps: ['Pergerakan pasar', 'Sentimen investor', 'Arus dana'], sectors: [], assets: ['Indeks saham terkait'], second: 'Volatilitas bisa menular ke pasar lain di zona waktu berikutnya.' },
  corporate: { steps: ['Kabar korporasi', 'Ekspektasi laba', 'Harga saham perusahaan dan pesaing'], sectors: [['Pesaing dan pemasok', '+/−']], assets: ['Saham perusahaan'], second: 'Revisi estimasi analis untuk sektor yang sama.' },
};

/* ---------- skor negara (EKSPERIMENTAL, transparan) ----------
   input: {growth, unemp, infl, debt, fiscal, ca, reservesMonths, polstab}
   tiap komponen 0-100; komponen tanpa data dilewati, tidak ditebak. */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const SCORE_RULES = {
  growth: { label: 'Pertumbuhan PDB riil (%)', f: v => clamp(50 + 10 * (v - 2), 0, 100), rule: '50 + 10×(g − 2), dibatasi 0–100' },
  unemp: { label: 'Pengangguran (%)', f: v => clamp(100 - 7 * (v - 3), 0, 100), rule: '100 − 7×(u − 3)' },
  infl: { label: 'Inflasi (%)', f: v => clamp(100 - 9 * Math.abs(v - 2.5), 0, 100), rule: '100 − 9×|π − 2,5|' },
  debt: { label: 'Utang pemerintah (% PDB)', f: v => clamp(100 - 0.8 * (v - 40), 0, 100), rule: '100 − 0,8×(utang − 40)' },
  fiscal: { label: 'Saldo fiskal (% PDB)', f: v => clamp(70 + 8 * v, 0, 100), rule: '70 + 8×saldo' },
  ca: { label: 'Transaksi berjalan (% PDB)', f: v => clamp(60 + 6 * v, 0, 100), rule: '60 + 6×saldo' },
  reservesMonths: { label: 'Cadangan devisa (bulan impor)', f: v => clamp(v / 8 * 100, 0, 100), rule: 'bulan ÷ 8 × 100' },
  polstab: { label: 'Stabilitas politik WGI (−2,5…2,5)', f: v => clamp((v + 2.5) / 5 * 100, 0, 100), rule: '(nilai + 2,5) ÷ 5 × 100' },
};
export const SCORE_GROUPS = [
  ['economic', 'Kesehatan ekonomi', ['growth', 'unemp']],
  ['fiscal', 'Kesehatan fiskal', ['debt', 'fiscal']],
  ['monetary', 'Stabilitas moneter', ['infl']],
  ['external', 'Risiko eksternal', ['ca', 'reservesMonths']],
  ['political', 'Stabilitas politik', ['polstab']],
];
export function countryScore(inp) {
  const groups = SCORE_GROUPS.map(([id, label, keys]) => {
    const parts = keys.filter(k => inp[k] !== null && inp[k] !== undefined && Number.isFinite(inp[k]))
      .map(k => ({ key: k, label: SCORE_RULES[k].label, raw: inp[k], score: Math.round(SCORE_RULES[k].f(inp[k])), rule: SCORE_RULES[k].rule }));
    const score = parts.length ? Math.round(parts.reduce((a, p) => a + p.score, 0) / parts.length) : null;
    return { id, label, score, parts };
  });
  const avail = groups.filter(g => g.score !== null);
  const total = avail.length >= 3 ? Math.round(avail.reduce((a, g) => a + g.score, 0) / avail.length) : null;
  return { total, groups, coverage: avail.length / groups.length };
}

/* ---------- statistik risiko dari deret harga nyata ---------- */
export function returns(prices) {
  const r = [];
  for (let i = 1; i < prices.length; i++) if (prices[i - 1] > 0 && prices[i] > 0) r.push(prices[i] / prices[i - 1] - 1);
  return r;
}
export const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
export function stdev(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
export function maxDrawdown(prices) {
  let peak = -Infinity, mdd = 0;
  for (const p of prices) { if (p > peak) peak = p; if (peak > 0) mdd = Math.min(mdd, p / peak - 1); }
  return mdd;
}
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function riskStats(prices, { periodsPerYear = 252, rf = 0 } = {}) {
  const r = returns(prices);
  if (r.length < 10) return null;
  const vol = stdev(r) * Math.sqrt(periodsPerYear);
  const mu = mean(r) * periodsPerYear;
  const down = r.filter(x => x < 0);
  const dd = down.length > 1 ? Math.sqrt(down.reduce((s, x) => s + x * x, 0) / down.length) * Math.sqrt(periodsPerYear) : NaN;
  const sorted = [...r].sort((a, b) => a - b);
  const var95 = quantile(sorted, 0.05);
  const tail = sorted.filter(x => x <= var95);
  return {
    n: r.length, vol, annReturn: mu, sharpe: vol ? (mu - rf) / vol : NaN, sortino: dd ? (mu - rf) / dd : NaN,
    maxDD: maxDrawdown(prices), var95, cvar95: tail.length ? mean(tail) : NaN,
  };
}
export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return NaN;
  const x = a.slice(-n), y = b.slice(-n), mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
export function beta(assetR, benchR) {
  const n = Math.min(assetR.length, benchR.length);
  if (n < 10) return NaN;
  const x = benchR.slice(-n), y = assetR.slice(-n), mx = mean(x), my = mean(y);
  let c = 0, v = 0;
  for (let i = 0; i < n; i++) { c += (x[i] - mx) * (y[i] - my); v += (x[i] - mx) ** 2; }
  return v ? c / v : NaN;
}
/* menyelaraskan beberapa deret {date,value} berdasarkan tanggal yang sama */
export function alignSeries(seriesMap) {
  const keys = Object.keys(seriesMap);
  if (!keys.length) return { dates: [], cols: {} };
  const sets = keys.map(k => new Map(seriesMap[k].map(p => [p.date, p.value])));
  const dates = [...sets[0].keys()].filter(d => sets.every(s => s.has(d))).sort();
  const cols = {};
  keys.forEach((k, i) => { cols[k] = dates.map(d => sets[i].get(d)); });
  return { dates, cols };
}

/* ---------- mesin rezim pasar (risk on / risk off) dari bukti yang tersedia ----------
   input: { vix, hyOas, curve2s10s, sp500VsMa200, dxyChg1m, oilChg1m } (null = tidak ada) */
export function marketRegime(x) {
  const ev = [];
  const add = (key, label, val, vote, why) => { if (val !== null && val !== undefined && Number.isFinite(val)) ev.push({ key, label, val, vote, why }); };
  if (x.vix != null) add('vix', 'VIX', x.vix, x.vix < 16 ? 1 : x.vix > 24 ? -1 : 0, x.vix < 16 ? 'volatilitas rendah' : x.vix > 24 ? 'volatilitas tinggi' : 'volatilitas sedang');
  if (x.hyOas != null) add('hy', 'Spread obligasi high-yield (%)', x.hyOas, x.hyOas < 3.5 ? 1 : x.hyOas > 5 ? -1 : 0, x.hyOas < 3.5 ? 'kredit longgar' : x.hyOas > 5 ? 'kredit ketat' : 'kredit normal');
  if (x.curve2s10s != null) add('curve', 'Kurva 10Y−2Y (%)', x.curve2s10s, x.curve2s10s > 0.25 ? 1 : x.curve2s10s < -0.25 ? -1 : 0, x.curve2s10s < -0.25 ? 'kurva terbalik' : x.curve2s10s > 0.25 ? 'kurva normal' : 'kurva datar');
  if (x.sp500VsMa200 != null) add('trend', 'S&P 500 vs MA200', x.sp500VsMa200, x.sp500VsMa200 > 0.02 ? 1 : x.sp500VsMa200 < -0.02 ? -1 : 0, x.sp500VsMa200 > 0 ? 'di atas tren jangka panjang' : 'di bawah tren jangka panjang');
  if (x.dxyChg1m != null) add('usd', 'Dolar AS 1 bulan', x.dxyChg1m, x.dxyChg1m < -0.01 ? 1 : x.dxyChg1m > 0.02 ? -1 : 0, x.dxyChg1m > 0.02 ? 'dolar menguat tajam (biasanya risk-off)' : x.dxyChg1m < -0.01 ? 'dolar melemah (likuiditas global longgar)' : 'dolar stabil');
  if (x.oilChg1m != null) add('oil', 'Minyak 1 bulan', x.oilChg1m, x.oilChg1m > 0.15 ? -1 : 0, x.oilChg1m > 0.15 ? 'lonjakan minyak (risiko inflasi)' : 'minyak tidak ekstrem');
  if (!ev.length) return { regime: 'Tidak diketahui', score: null, confidence: 0, evidence: [] };
  const score = ev.reduce((a, e) => a + e.vote, 0) / ev.length;
  const agree = ev.filter(e => Math.sign(e.vote) === Math.sign(score) && e.vote !== 0).length / ev.length;
  const regime = score > 0.33 ? 'Risk on' : score < -0.33 ? 'Risk off' : (Math.abs(score) < 0.1 ? 'Netral' : 'Transisi');
  return { regime, score, confidence: Math.round(100 * agree * Math.min(1, ev.length / 5)), evidence: ev };
}

/* ---------- uji tekanan portofolio (sensitivitas sederhana, asumsi tertulis) ---------- */
export const SHOCKS = {
  'oil+20': { label: 'Minyak +20%', f: { energy: 0.12, equity: -0.02, bond: -0.01, gold: 0.02, crypto: -0.03, cash: 0, em: -0.03 } },
  'oil-20': { label: 'Minyak −20%', f: { energy: -0.12, equity: 0.01, bond: 0.005, gold: -0.01, crypto: 0.01, cash: 0, em: 0.01 } },
  'usd+5': { label: 'USD +5%', f: { energy: -0.03, equity: -0.02, bond: -0.01, gold: -0.04, crypto: -0.05, cash: 0, em: -0.06 } },
  'usd-5': { label: 'USD −5%', f: { energy: 0.03, equity: 0.02, bond: 0.01, gold: 0.04, crypto: 0.05, cash: 0, em: 0.06 } },
  'rates+100': { label: 'Suku bunga +100 bps', f: { energy: -0.02, equity: -0.07, bond: -0.065, gold: -0.03, crypto: -0.10, cash: 0.01, em: -0.08 } },
  'rates-100': { label: 'Suku bunga −100 bps', f: { energy: 0.01, equity: 0.05, bond: 0.065, gold: 0.03, crypto: 0.08, cash: -0.01, em: 0.05 } },
  'eq-10': { label: 'Saham −10%', f: { energy: -0.08, equity: -0.10, bond: 0.02, gold: 0.02, crypto: -0.15, cash: 0, em: -0.12 } },
  'eq-20': { label: 'Saham −20%', f: { energy: -0.16, equity: -0.20, bond: 0.04, gold: 0.04, crypto: -0.30, cash: 0, em: -0.25 } },
  'crypto-30': { label: 'Kripto −30%', f: { energy: 0, equity: -0.01, bond: 0, gold: 0, crypto: -0.30, cash: 0, em: -0.01 } },
  'infl+2': { label: 'Inflasi +2 poin', f: { energy: 0.05, equity: -0.06, bond: -0.08, gold: 0.06, crypto: -0.05, cash: -0.02, em: -0.05 } },
  geo: { label: 'Guncangan geopolitik', f: { energy: 0.08, equity: -0.06, bond: 0.02, gold: 0.06, crypto: -0.08, cash: 0, em: -0.09 } },
};
export function stressTest(positions, shockId) {
  const s = SHOCKS[shockId];
  if (!s) return null;
  const rows = positions.map(p => ({ ...p, pnl: p.value * (s.f[p.cls] ?? 0), mult: s.f[p.cls] ?? 0 }));
  const total = rows.reduce((a, r) => a + r.pnl, 0);
  const value = positions.reduce((a, p) => a + p.value, 0);
  return { label: s.label, rows, total, pct: value ? total / value : 0 };
}
