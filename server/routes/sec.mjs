/* =====================================================================
   SEC EDGAR: fundamental resmi dan gratis untuk perusahaan pelapor SEC (AS)
   Endpoint SEC yang dipakai (semuanya JSON publik, tanpa kunci):
     https://www.sec.gov/files/company_tickers.json                      ticker -> CIK
     https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json        semua fakta XBRL satu perusahaan
     https://data.sec.gov/submissions/CIK##########.json                  identitas (SIC) + daftar laporan
     https://data.sec.gov/api/xbrl/frames/us-gaap/{konsep}/{satuan}/{periode}.json   satu konsep, semua perusahaan
   Aturan akses wajar SEC: maksimal 10 permintaan/detik dan header User-Agent berisi nama +
   email kontak. Server ini memakai 5/detik dan User-Agent dari SEC_USER_AGENT di .env.
   Browser tidak bisa memanggil SEC langsung (tanpa CORS), jadi semua lewat sini.
   companyfacts bisa beberapa MB: diringkas DI SERVER (shared/fundamentals.mjs) sebelum dikirim.
   ===================================================================== */
import * as F from '../../shared/fundamentals.mjs';
import * as S from '../../shared/screener.mjs';

export default ctx => {
  const { viaCache, need, upstream, UpstreamError, BadRequest, env } = ctx;
  const ua = () => String(env.SEC_USER_AGENT || '').trim();
  /* User-Agent wajib: kosong atau tanpa email -> 503 dengan cara memperbaikinya (tidak mengarang email) */
  function agent() {
    const v = ua();
    if (!v) throw new UpstreamError('SEC_USER_AGENT belum diisi di .env server. SEC mewajibkan User-Agent berisi nama dan email kontak. Tambahkan baris SEC_USER_AGENT="Nama Kamu emailkamu@domain" (pakai email aslimu), lalu jalankan ulang npm start.', 503);
    if (!/^[\x20-\x7E]{5,200}$/.test(v) || !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(v)) throw new UpstreamError('SEC_USER_AGENT di .env harus berisi nama dan alamat email kontak (huruf ASCII), contoh bentuk: SEC_USER_AGENT="Nama Kamu emailkamu@domain". Jalankan ulang npm start setelah diubah.', 503);
    return v;
  }
  const get = (url, timeout) => upstream(url, { timeout, headers: { 'User-Agent': agent(), Accept: 'application/json' } });

  const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
  const tickers = () => viaCache('sec', 'sec:tickers', 24 * 3600e3, TICKERS_URL, async () => F.parseTickers(await get(TICKERS_URL, 30000)));
  /* kunci cache dibatasi: hanya CIK yang ada di daftar perusahaan bertiker SEC (±10 ribu) */
  async function knownCik(cik) {
    let t;
    try { t = await tickers(); } catch { return; }             // daftar ticker gagal: CIK sudah divalidasi ketat, lanjut
    if (!t.data.byCik[Number(cik)]) throw new UpstreamError(`CIK ${cik} tidak ada di daftar perusahaan bertiker SEC (company_tickers.json).`, 404);
  }
  const cikParam = q => F.cikPad(need(q.get('cik'), /^\d{1,10}$/, 'cik'));

  return {
    providers: [['sec', {
      name: 'SEC EDGAR (XBRL + submissions)', kind: 'Fundamental AS', auth: ua() ? 'User-Agent dari .env (tanpa kunci)' : 'butuh SEC_USER_AGENT di .env', configured: !!ua(),
      limit: 'maks 10 permintaan/detik (aturan SEC); server memakai 5/detik; di-cache 6–24 jam', homepage: 'https://www.sec.gov/edgar/sec-api-documentation', quality: 'historical',
    }]],
    gates: { sec: new ctx.Bucket(5, 5) },
    routes: {
      /* ticker -> CIK (daftar resmi SEC, di-cache 24 jam) */
      '/api/sec/cik': async q => {
        const tk = F.secTicker(need(q.get('ticker'), /^[A-Za-z0-9.\-]{1,10}$/, 'ticker'));
        agent();
        const t = await tickers();
        const hit = t.data.byTicker[tk];
        if (!hit) throw new UpstreamError(`Ticker ${tk} tidak ada di daftar SEC (company_tickers.json): bukan pelapor SEC, atau kodenya berbeda.`, 404);
        return { ...t, data: { ticker: tk, cik: F.cikPad(hit[0]), title: hit[1] } };
      },
      /* companyfacts, diringkas di server jadi deret tahunan/kuartalan (12 jam) */
      '/api/sec/facts': async q => {
        const cik = cikParam(q);
        agent();
        await knownCik(cik);
        const url = F.factsUrl(cik);
        return viaCache('sec', 'sec:facts:' + cik, 12 * 3600e3, url, async () => F.compactFacts(await get(url, 45000)));
      },
      /* identitas (SIC, tahun fiskal) + laporan terbaru 10-K/10-Q/8-K/Form 4/13D-G (6 jam) */
      '/api/sec/filings': async q => {
        const cik = cikParam(q);
        agent();
        await knownCik(cik);
        const url = F.submissionsUrl(cik);
        return viaCache('sec', 'sec:subm:' + cik, 6 * 3600e3, url, async () => F.parseSubmissions(await get(url, 30000)));
      },
      /* frames: satu konsep untuk semua pelapor bertiker. Konsep, satuan, dan periode dari daftar tetap. */
      '/api/sec/frames': async q => {
        const concept = need(q.get('concept'), /^[A-Za-z]{3,80}$/, 'concept');
        const spec = S.FRAME_ALLOW[concept];
        if (!spec) throw new BadRequest(`Konsep "${concept}" tidak ada di daftar yang diizinkan`);
        const unit = need(q.get('unit'), /^(USD|USD-per-shares|shares)$/, 'unit');
        if (unit !== spec.unit) throw new BadRequest(`Satuan "${unit}" tidak cocok untuk ${concept} (harus ${spec.unit})`);
        const period = need(q.get('period'), /^CY\d{4}(Q[1-4]I)?$/, 'period');
        if (!S.validPeriod(period, spec.kind)) throw new BadRequest(`Periode "${period}" tidak valid untuk ${concept} (${spec.kind === 'inst' ? 'pakai CY####Q#I' : 'pakai CY####'}, tahun 2009 sampai tahun ini)`);
        agent();
        const t = await tickers();
        const url = S.frameUrl(concept, unit, period);
        const r = await viaCache('sec', 'sec:fr:' + concept + ':' + period, 24 * 3600e3, url, async () => S.parseFrame(await get(url, 60000), t.data.byCik));
        return { ...r, tickersFetchedAt: t.fetchedAt };
      },
    },
  };
};
