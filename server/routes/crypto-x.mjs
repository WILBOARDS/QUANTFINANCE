/* =====================================================================
   KRIPTO TAMBAHAN: transaksi terbaru (spot), derivatif (USD-M futures), on-chain Bitcoin
   Semua endpoint publik tanpa kunci:
     Binance spot     GET /api/v3/aggTrades?symbol=BTCUSDT&limit=500          (api.binance.com, cermin data-api.binance.vision)
     Binance futures  GET /fapi/v1/premiumIndex?symbol=BTCUSDT                (mark price + funding terakhir)
                      GET /fapi/v1/openInterest?symbol=BTCUSDT                (open interest saat ini, dalam koin)
                      GET /futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=48
     mempool.space    GET /api/v1/fees/recommended, /api/blocks, /api/mempool  (Bitcoin saja)
   Data derivatif dan on-chain hanya lewat server (host tidak masuk connect-src browser).
   ===================================================================== */
import * as X from '../../shared/cryptox.mjs';

export default ctx => {
  const { viaCache, multiHost, need, opt, upstream } = ctx;
  const SPOT = ['https://api.binance.com', 'https://data-api.binance.vision'];
  const FAPI = 'https://fapi.binance.com';
  const MEMPOOL = 'https://mempool.space';
  const sym = q => need(q.get('symbol'), X.SYMBOL_RE, 'symbol');
  return {
    providers: [
      ['binancefut', { name: 'Binance USD-M futures (publik)', kind: 'Derivatif kripto', auth: 'tanpa kunci', configured: true, limit: 'bobot permintaan per menit per IP; di-cache 15–60 detik', homepage: 'https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info', quality: 'live' }],
      ['mempool', { name: 'mempool.space (Bitcoin)', kind: 'On-chain', auth: 'tanpa kunci', configured: true, limit: 'API publik dengan batas wajar; di-cache 30–60 detik', homepage: 'https://mempool.space/docs/api/rest', quality: 'live' }],
    ],
    gates: { binancefut: new ctx.Bucket(5, 2), mempool: new ctx.Bucket(3, 1) },
    routes: {
      /* transaksi terbaru: 500 aggTrades (gabungan transaksi pada harga & waktu sama) */
      '/api/crypto/trades': async q => {
        const s = sym(q);
        const urlOf = h => `${h}/api/v3/aggTrades?symbol=${s}&limit=500`;
        return multiHost('binance', SPOT, h => 'agg:' + urlOf(h), urlOf, 5e3, async url => X.parseAggTrades(await upstream(url, { timeout: 8000 })));
      },
      /* funding + mark price + OI saat ini + riwayat OI (1 jam x 48 atau 4 jam x 42) */
      '/api/crypto/derivs': async q => {
        const s = sym(q);
        const period = opt(q.get('period'), /^(1h|4h)$/, '1h');
        const limit = period === '1h' ? 48 : 42;
        const pUrl = `${FAPI}/fapi/v1/premiumIndex?symbol=${s}`, oUrl = `${FAPI}/fapi/v1/openInterest?symbol=${s}`, hUrl = `${FAPI}/futures/data/openInterestHist?symbol=${s}&period=${period}&limit=${limit}`;
        const [p, o, h] = await Promise.all([
          viaCache('binancefut', 'fp:' + s, 15e3, pUrl, async () => X.parsePremium(await upstream(pUrl, { timeout: 8000 }))),
          viaCache('binancefut', 'fo:' + s, 15e3, oUrl, async () => X.parseOpenInterest(await upstream(oUrl, { timeout: 8000 }))),
          viaCache('binancefut', 'fh:' + s + period, 5 * 60e3, hUrl, async () => X.parseOiHist(await upstream(hUrl, { timeout: 10000 }))).catch(e => ({ ok: false, error: e.message })),
        ]);
        return { ...p, data: { premium: p.data, oi: o.data, oiFetchedAt: o.fetchedAt, oiStale: o.stale, hist: h.ok === false ? null : h.data, histError: h.ok === false ? h.error : null, histFetchedAt: h.fetchedAt || null, period } };
      },
      /* on-chain Bitcoin: biaya rekomendasi, 10 blok terakhir, ringkasan mempool */
      '/api/onchain/btc': async () => {
        const fUrl = `${MEMPOOL}/api/v1/fees/recommended`, bUrl = `${MEMPOOL}/api/blocks`, mUrl = `${MEMPOOL}/api/mempool`;
        const [f, b, m] = await Promise.all([
          viaCache('mempool', 'mp:fees', 30e3, fUrl, async () => X.parseFees(await upstream(fUrl, { timeout: 8000 }))),
          viaCache('mempool', 'mp:blocks', 60e3, bUrl, async () => X.parseBlocks(await upstream(bUrl, { timeout: 8000 }))),
          viaCache('mempool', 'mp:mempool', 30e3, mUrl, async () => X.parseMempool(await upstream(mUrl, { timeout: 8000 }))).catch(e => ({ ok: false, error: e.message })),
        ]);
        return { ...f, data: { fees: f.data, blocks: b.data, blocksFetchedAt: b.fetchedAt, mempool: m.ok === false ? null : m.data, mempoolError: m.ok === false ? m.error : null } };
      },
    },
  };
};
