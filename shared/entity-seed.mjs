/* =====================================================================
   KATALOG REFERENSI ENTITAS (bukan data pasar)
   Isi: kode, nama, jenis, bursa/negara, mata uang, dan simbol di tiap penyedia
   data gratis. TIDAK ADA harga, kapitalisasi, volume, atau angka pasar di sini.
   Harga selalu diambil dari penyedia saat dibutuhkan; kalau penyedianya tidak
   tersedia, aplikasi menampilkan "Tidak tersedia", bukan angka karangan.

   Simbol penyedia:
     finnhub  : kode saham/ETF AS di Finnhub (butuh kunci di server)
     yahoo    : kode Yahoo Finance (TIDAK RESMI, mati bawaan, bisa putus kapan saja)
     binance  : pasangan spot Binance (publik, tanpa kunci)
     coingecko: id CoinGecko (publik, batas permintaan ketat)
     fred     : id seri FRED (St. Louis Fed); frekuensi ditulis di "freq"
     fx       : kode mata uang [basis, kutipan] untuk open.er-api / Frankfurter (harian)
   Bursa saham AS ditulis "US" saja; bursa persisnya (NYSE/Nasdaq) diambil dari
   profil Finnhub saat tersedia, supaya katalog ini tidak memuat klaim yang bisa basi.
   ===================================================================== */

const stock = (symbol, name, country, currency, sector, providers = {}, extra = {}) => ({
  id: 'stock:' + symbol, type: 'stock', symbol, name, country, currency, sector,
  exchange: extra.exchange || country, providers, aliases: extra.aliases || [], weight: extra.weight || 0, ...(extra.note ? { note: extra.note } : {}),
});
const us = (symbol, name, sector, aliases = [], weight = 0, extra = {}) =>
  stock(symbol, name, 'US', 'USD', sector, { finnhub: symbol, yahoo: extra.yahoo || symbol }, { aliases, weight, ...extra });

/* saham yang sudah ada di daftar pasar (STOCK_DEFS) + tambahan populer */
export const STOCKS = [
  us('AAPL', 'Apple Inc.', 'Teknologi', ['APPLE'], 5),
  us('MSFT', 'Microsoft Corporation', 'Teknologi', ['MICROSOFT'], 5),
  us('NVDA', 'NVIDIA Corporation', 'Teknologi', ['NVIDIA'], 5),
  us('AMZN', 'Amazon.com, Inc.', 'Konsumer', ['AMAZON'], 4),
  us('GOOGL', 'Alphabet Inc. (Kelas A)', 'Komunikasi', ['ALPHABET', 'GOOGLE'], 4),
  us('META', 'Meta Platforms, Inc.', 'Komunikasi', ['FACEBOOK'], 4),
  us('TSLA', 'Tesla, Inc.', 'Otomotif', ['TESLA'], 4),
  us('JPM', 'JPMorgan Chase & Co.', 'Keuangan', ['JPMORGAN', 'JP MORGAN'], 3),
  us('VALE', 'Vale S.A. (ADR)', 'Pertambangan', [], 1),
  us('TSM', 'Taiwan Semiconductor Manufacturing (ADR)', 'Teknologi', ['TAIWAN SEMICONDUCTOR'], 3),
  us('AMD', 'Advanced Micro Devices, Inc.', 'Teknologi', [], 3),
  us('AVGO', 'Broadcom Inc.', 'Teknologi', ['BROADCOM'], 3),
  us('NFLX', 'Netflix, Inc.', 'Komunikasi', ['NETFLIX'], 2),
  us('BRK.B', 'Berkshire Hathaway Inc. (Kelas B)', 'Keuangan', ['BERKSHIRE', 'BRKB', 'BRK-B'], 3, { yahoo: 'BRK-B' }),
  us('V', 'Visa Inc.', 'Keuangan', ['VISA'], 2),
  us('MA', 'Mastercard Incorporated', 'Keuangan', ['MASTERCARD'], 2),
  us('XOM', 'Exxon Mobil Corporation', 'Energi', ['EXXON', 'EXXONMOBIL'], 2),
  us('CVX', 'Chevron Corporation', 'Energi', ['CHEVRON'], 1),
  us('WMT', 'Walmart Inc.', 'Konsumer', ['WALMART'], 2),
  us('KO', 'The Coca-Cola Company', 'Konsumer', ['COCA COLA', 'COCA-COLA'], 1),
  us('PEP', 'PepsiCo, Inc.', 'Konsumer', ['PEPSI', 'PEPSICO'], 1),
  us('COST', 'Costco Wholesale Corporation', 'Konsumer', ['COSTCO'], 1),
  us('ORCL', 'Oracle Corporation', 'Teknologi', ['ORACLE'], 2),
  us('CRM', 'Salesforce, Inc.', 'Teknologi', ['SALESFORCE'], 1),
  us('INTC', 'Intel Corporation', 'Teknologi', ['INTEL'], 2),
  us('BABA', 'Alibaba Group Holding (ADR)', 'Konsumer', ['ALIBABA'], 2),
  us('LLY', 'Eli Lilly and Company', 'Kesehatan', ['ELI LILLY', 'LILLY'], 2),
  us('NVO', 'Novo Nordisk A/S (ADR)', 'Kesehatan', ['NOVO NORDISK'], 1),
  us('UNH', 'UnitedHealth Group Incorporated', 'Kesehatan', ['UNITEDHEALTH'], 1),
  us('JNJ', 'Johnson & Johnson', 'Kesehatan', ['JOHNSON & JOHNSON', 'JOHNSON AND JOHNSON'], 1),
  us('PG', 'The Procter & Gamble Company', 'Konsumer', ['PROCTER & GAMBLE', 'P&G'], 1),
  us('HD', 'The Home Depot, Inc.', 'Konsumer', ['HOME DEPOT'], 1),
  us('BAC', 'Bank of America Corporation', 'Keuangan', ['BANK OF AMERICA'], 1),
  us('GS', 'The Goldman Sachs Group, Inc.', 'Keuangan', ['GOLDMAN', 'GOLDMAN SACHS'], 1),
  us('MS', 'Morgan Stanley', 'Keuangan', [], 1),
  us('DIS', 'The Walt Disney Company', 'Komunikasi', ['DISNEY'], 1),
  us('ADBE', 'Adobe Inc.', 'Teknologi', ['ADOBE'], 1),
  us('QCOM', 'QUALCOMM Incorporated', 'Teknologi', ['QUALCOMM'], 1),
  us('MU', 'Micron Technology, Inc.', 'Teknologi', ['MICRON'], 1),
  us('PLTR', 'Palantir Technologies Inc.', 'Teknologi', ['PALANTIR'], 2),
  us('COIN', 'Coinbase Global, Inc.', 'Keuangan', ['COINBASE'], 1),
  us('MSTR', 'Strategy Inc (dulu MicroStrategy)', 'Teknologi', ['MICROSTRATEGY', 'STRATEGY'], 1),
  us('UBER', 'Uber Technologies, Inc.', 'Teknologi', [], 1),
  stock('BBCA', 'Bank Central Asia Tbk', 'ID', 'IDR', 'Keuangan', { yahoo: 'BBCA.JK' }, { aliases: ['BCA'], weight: 4 }),
  stock('BBRI', 'Bank Rakyat Indonesia (Persero) Tbk', 'ID', 'IDR', 'Keuangan', { yahoo: 'BBRI.JK' }, { aliases: ['BRI'], weight: 3 }),
  stock('BMRI', 'Bank Mandiri (Persero) Tbk', 'ID', 'IDR', 'Keuangan', { yahoo: 'BMRI.JK' }, { aliases: ['MANDIRI'], weight: 3 }),
  stock('TLKM', 'Telkom Indonesia (Persero) Tbk', 'ID', 'IDR', 'Telekomunikasi', { yahoo: 'TLKM.JK' }, { aliases: ['TELKOM'], weight: 2 }),
  stock('ASII', 'Astra International Tbk', 'ID', 'IDR', 'Industri', { yahoo: 'ASII.JK' }, { aliases: ['ASTRA'], weight: 2 }),
  stock('UNVR', 'Unilever Indonesia Tbk', 'ID', 'IDR', 'Konsumer', { yahoo: 'UNVR.JK' }, { weight: 1 }),
  stock('GOTO', 'GoTo Gojek Tokopedia Tbk', 'ID', 'IDR', 'Teknologi', { yahoo: 'GOTO.JK' }, { aliases: ['GOJEK', 'TOKOPEDIA'], weight: 1 }),
  stock('7203', 'Toyota Motor Corporation', 'JP', 'JPY', 'Otomotif', { yahoo: '7203.T' }, { aliases: ['TOYOTA'], weight: 2 }),
  stock('0700', 'Tencent Holdings', 'HK', 'HKD', 'Teknologi', { yahoo: '0700.HK' }, { aliases: ['TENCENT'], weight: 2 }),
  stock('005930', 'Samsung Electronics', 'KR', 'KRW', 'Teknologi', { yahoo: '005930.KS' }, { aliases: ['SAMSUNG'], weight: 2 }),
  stock('2330', 'TSMC (Taiwan)', 'TW', 'TWD', 'Teknologi', { yahoo: '2330.TW' }, { aliases: ['TSMC'], weight: 2 }),
  stock('BHP', 'BHP Group', 'AU', 'AUD', 'Pertambangan', { yahoo: 'BHP.AX' }, { weight: 1 }),
  stock('ASML', 'ASML Holding', 'NL', 'EUR', 'Teknologi', { yahoo: 'ASML.AS' }, { weight: 2 }),
  stock('SAP', 'SAP SE', 'DE', 'EUR', 'Teknologi', { yahoo: 'SAP.DE' }, { weight: 1 }),
  stock('MC', 'LVMH Moët Hennessy Louis Vuitton', 'FR', 'EUR', 'Konsumer', { yahoo: 'MC.PA' }, { aliases: ['LVMH'], weight: 1 }),
  stock('SHEL', 'Shell plc', 'GB', 'GBP', 'Energi', { yahoo: 'SHEL.L' }, { aliases: ['SHELL'], weight: 1 }),
  stock('AZN', 'AstraZeneca plc', 'GB', 'GBP', 'Kesehatan', { yahoo: 'AZN.L' }, { aliases: ['ASTRAZENECA'], weight: 1 }),
];

const etf = (symbol, name, focus, aliases = []) => ({
  id: 'etf:' + symbol, type: 'etf', symbol, name, country: 'US', currency: 'USD', exchange: 'US', sector: focus,
  providers: { finnhub: symbol, yahoo: symbol }, aliases, weight: 1,
});
export const ETFS = [
  etf('SPY', 'SPDR S&P 500 ETF Trust', 'Saham AS besar (S&P 500)'),
  etf('VOO', 'Vanguard S&P 500 ETF', 'Saham AS besar (S&P 500)'),
  etf('QQQ', 'Invesco QQQ Trust', 'Nasdaq-100'),
  etf('IWM', 'iShares Russell 2000 ETF', 'Saham AS kecil'),
  etf('DIA', 'SPDR Dow Jones Industrial Average ETF Trust', 'Dow Jones'),
  etf('VTI', 'Vanguard Total Stock Market ETF', 'Seluruh pasar saham AS'),
  etf('EEM', 'iShares MSCI Emerging Markets ETF', 'Pasar berkembang'),
  etf('EFA', 'iShares MSCI EAFE ETF', 'Pasar maju non-AS'),
  etf('EWJ', 'iShares MSCI Japan ETF', 'Jepang'),
  etf('EIDO', 'iShares MSCI Indonesia ETF', 'Indonesia'),
  etf('FXI', 'iShares China Large-Cap ETF', 'Tiongkok'),
  etf('INDA', 'iShares MSCI India ETF', 'India'),
  etf('GLD', 'SPDR Gold Shares', 'Emas'),
  etf('SLV', 'iShares Silver Trust', 'Perak'),
  etf('TLT', 'iShares 20+ Year Treasury Bond ETF', 'Obligasi pemerintah AS jangka panjang'),
  etf('IEF', 'iShares 7-10 Year Treasury Bond ETF', 'Obligasi pemerintah AS jangka menengah'),
  etf('HYG', 'iShares iBoxx $ High Yield Corporate Bond ETF', 'Obligasi korporasi high-yield'),
  etf('LQD', 'iShares iBoxx $ Investment Grade Corporate Bond ETF', 'Obligasi korporasi investment grade'),
  etf('XLE', 'Energy Select Sector SPDR Fund', 'Sektor energi AS'),
  etf('XLF', 'Financial Select Sector SPDR Fund', 'Sektor keuangan AS'),
  etf('XLK', 'Technology Select Sector SPDR Fund', 'Sektor teknologi AS'),
  etf('SMH', 'VanEck Semiconductor ETF', 'Semikonduktor'),
  etf('USO', 'United States Oil Fund', 'Minyak (berjangka)'),
  etf('UNG', 'United States Natural Gas Fund', 'Gas alam (berjangka)'),
  etf('VNQ', 'Vanguard Real Estate ETF', 'Properti (REIT) AS'),
  etf('ARKK', 'ARK Innovation ETF', 'Saham inovasi'),
];

/* indeks: sama dengan INDEX_DEFS di src/js/01-core.js; FRED hanya punya sebagian (harian) */
const idx = (symbol, name, country, yahoo, aliases = [], fred) => ({
  id: 'index:' + symbol, type: 'index', symbol, name, country, exchange: country, providers: { yahoo, ...(fred ? { fred } : {}) }, aliases, weight: 2,
});
export const INDICES = [
  idx('SPX', 'S&P 500', 'US', '^GSPC', ['S&P', 'SP500', 'S&P500'], 'SP500'),
  idx('IXIC', 'Nasdaq Composite', 'US', '^IXIC', ['NASDAQ', 'COMP', 'NASDAQ COMPOSITE'], 'NASDAQCOM'),
  idx('DJI', 'Dow Jones Industrial Average', 'US', '^DJI', ['DOW', 'DOW JONES'], 'DJIA'),
  idx('TSX', 'S&P/TSX Composite', 'CA', '^GSPTSE'),
  idx('IBOV', 'Ibovespa', 'BR', '^BVSP'),
  idx('FTSE', 'FTSE 100', 'GB', '^FTSE'),
  idx('DAX', 'DAX 40', 'DE', '^GDAXI'),
  idx('CAC', 'CAC 40', 'FR', '^FCHI'),
  idx('NKY', 'Nikkei 225', 'JP', '^N225', ['NIKKEI'], 'NIKKEI225'),
  idx('HSI', 'Hang Seng', 'HK', '^HSI', ['HANG SENG']),
  idx('SSEC', 'Shanghai Composite', 'CN', '000001.SS', ['SHANGHAI']),
  idx('KOSPI', 'KOSPI', 'KR', '^KS11'),
  idx('TAIEX', 'TAIEX', 'TW', '^TWII'),
  idx('SENSEX', 'BSE Sensex', 'IN', '^BSESN'),
  idx('IHSG', 'IHSG (Jakarta Composite)', 'ID', '^JKSE', ['JCI', 'JAKARTA COMPOSITE', 'COMPOSITE INDEX']),
  idx('STI', 'Straits Times Index', 'SG', '^STI'),
  idx('ASX', 'S&P/ASX 200', 'AU', '^AXJO'),
  idx('JSE', 'JSE Top 40', 'ZA', '^J200.JO'),
  idx('TASI', 'Tadawul All Share', 'SA', '^TASI.SR'),
  { id: 'index:VIX', type: 'index', symbol: 'VIX', name: 'CBOE Volatility Index', country: 'US', exchange: 'US', providers: { fred: 'VIXCLS', yahoo: '^VIX' }, aliases: ['VOLATILITY'], weight: 2 },
];

const coin = (symbol, name, coingecko, aliases = [], weight = 1) => ({
  id: 'crypto:' + symbol, type: 'crypto', symbol, name, currency: 'USD', exchange: 'CRYPTO',
  providers: { binance: symbol + 'USDT', coingecko }, aliases, weight,
  note: 'Harga Binance dalam USDT (stablecoin), dipakai sebagai pendekatan USD.',
});
export const CRYPTO = [
  coin('BTC', 'Bitcoin', 'bitcoin', ['BITCOIN', 'XBT'], 5),
  coin('ETH', 'Ethereum', 'ethereum', ['ETHEREUM', 'ETHER'], 4),
  coin('SOL', 'Solana', 'solana', ['SOLANA'], 3),
  coin('BNB', 'BNB', 'binancecoin', [], 2),
  coin('XRP', 'XRP', 'ripple', ['RIPPLE'], 2),
  coin('ADA', 'Cardano', 'cardano', ['CARDANO']),
  coin('DOGE', 'Dogecoin', 'dogecoin', ['DOGECOIN'], 2),
  coin('AVAX', 'Avalanche', 'avalanche-2', ['AVALANCHE']),
  coin('LINK', 'Chainlink', 'chainlink', ['CHAINLINK']),
  coin('DOT', 'Polkadot', 'polkadot', ['POLKADOT']),
  coin('TRX', 'TRON', 'tron', ['TRON']),
  coin('TON', 'Toncoin', 'the-open-network', ['TONCOIN']),
  coin('LTC', 'Litecoin', 'litecoin', ['LITECOIN']),
];

/* valas: [basis, kutipan]. FRED (H.10, harian, tertunda) memakai arah kutipan sendiri; "fredInvert"
   berarti nilai FRED harus dibalik (1/x) agar sama dengan arah pasangan di sini. */
const fx = (base, quote, aliases = [], fred, fredInvert = false, weight = 1) => ({
  id: 'fx:' + base + quote, type: 'fx', symbol: base + quote, name: `${base}/${quote}`, currency: quote,
  providers: { fx: [base, quote], yahoo: (base === 'USD' ? quote : base + quote) + '=X', ...(fred ? { fred, fredInvert } : {}) },
  aliases: [base + '/' + quote, ...aliases], weight,
});
export const FX = [
  fx('USD', 'IDR', ['RUPIAH', 'IDR'], null, false, 4),
  fx('EUR', 'USD', ['EURO', 'FIBER'], 'DEXUSEU', false, 3),
  fx('USD', 'JPY', ['YEN', 'JPY'], 'DEXJPUS', false, 3),
  fx('GBP', 'USD', ['POUND', 'CABLE', 'STERLING'], 'DEXUSUK', false, 2),
  fx('USD', 'CNY', ['YUAN', 'RENMINBI', 'CNY'], 'DEXCHUS', false, 2),
  fx('AUD', 'USD', ['AUSSIE'], 'DEXUSAL'),
  fx('USD', 'CAD', ['LOONIE'], 'DEXCAUS'),
  fx('USD', 'CHF', ['SWISSIE', 'FRANC'], 'DEXSZUS'),
  fx('USD', 'SGD', [], 'DEXSIUS'),
  fx('USD', 'KRW', ['WON'], 'DEXKOUS'),
  fx('USD', 'INR', ['RUPEE'], 'DEXINUS'),
  fx('USD', 'MYR', ['RINGGIT'], 'DEXMAUS'),
  fx('EUR', 'IDR', []),
  { id: 'fx:DXY', type: 'fx', symbol: 'USDBROAD', name: 'Indeks dolar AS (broad, Fed)', currency: '', providers: { fred: 'DTWEXBGS' }, aliases: ['DOLLAR INDEX', 'DXY', 'USD INDEX'], weight: 2,
    note: 'Ini indeks dolar trade-weighted dari Federal Reserve (FRED DTWEXBGS), BUKAN indeks DXY milik ICE.' },
];

/* komoditas: FRED (WTI/Brent/Henry Hub harian; logam & pertanian bulanan dari IMF) dan
   Yahoo kontrak berjangka (tidak resmi). Emas & perak tidak ada di FRED (seri LBMA dihapus 2022),
   jadi tanpa Yahoo keduanya ditampilkan "Tidak tersedia". */
const cm = (symbol, name, unit, providers, aliases = [], weight = 1) => ({
  id: 'commodity:' + symbol, type: 'commodity', symbol, name, unit, currency: 'USD', providers, aliases, weight,
});
export const COMMODITIES = [
  cm('GOLD', 'Emas', 'USD/troy ons', { yahoo: 'GC=F' }, ['XAU', 'XAUUSD', 'EMAS'], 3),
  cm('SILVER', 'Perak', 'USD/troy ons', { yahoo: 'SI=F' }, ['XAG', 'XAGUSD', 'PERAK'], 2),
  cm('WTI', 'Minyak mentah WTI', 'USD/barel', { fred: 'DCOILWTICO', freq: 'd', yahoo: 'CL=F' }, ['OIL', 'CRUDE', 'MINYAK', 'CL'], 3),
  cm('BRENT', 'Minyak mentah Brent', 'USD/barel', { fred: 'DCOILBRENTEU', freq: 'd', yahoo: 'BZ=F' }, ['UKOIL'], 2),
  cm('NATGAS', 'Gas alam Henry Hub', 'USD/MMBtu', { fred: 'DHHNGSP', freq: 'd', yahoo: 'NG=F' }, ['GAS', 'NG', 'GAS ALAM', 'NATURAL GAS'], 2),
  cm('LNG', 'LNG Asia (Jepang)', 'USD/MMBtu', { fred: 'PNGASJPUSDM', freq: 'm' }),
  cm('COPPER', 'Tembaga', 'USD/ton', { fred: 'PCOPPUSDM', freq: 'm', yahoo: 'HG=F' }, ['TEMBAGA', 'HG']),
  cm('ALUMINUM', 'Aluminium', 'USD/ton', { fred: 'PALUMUSDM', freq: 'm' }, ['ALUMINIUM']),
  cm('NICKEL', 'Nikel', 'USD/ton', { fred: 'PNICKUSDM', freq: 'm' }, ['NIKEL']),
  cm('COAL', 'Batu bara Australia', 'USD/ton', { fred: 'PCOALAUUSDM', freq: 'm' }, ['BATU BARA', 'BATUBARA']),
  cm('URANIUM', 'Uranium', 'USD/lb', { fred: 'PURANUSDM', freq: 'm' }),
  cm('WHEAT', 'Gandum', 'USD/ton', { fred: 'PWHEAMTUSDM', freq: 'm' }, ['GANDUM']),
  cm('CORN', 'Jagung', 'USD/ton', { fred: 'PMAIZMTUSDM', freq: 'm' }, ['JAGUNG']),
  cm('COFFEE', 'Kopi arabika', 'sen USD/lb', { fred: 'PCOFFOTMUSDM', freq: 'm' }, ['KOPI']),
  cm('SUGAR', 'Gula', 'sen USD/lb', { fred: 'PSUGAISAUSDM', freq: 'm' }, ['GULA']),
  cm('PALMOIL', 'Minyak sawit', 'USD/ton', { fred: 'PPOILUSDM', freq: 'm' }, ['CPO', 'SAWIT', 'PALM OIL']),
];

/* suku bunga & obligasi (FRED). Obligasi 10 tahun negara lain: seri OECD bulanan. */
const rate = (symbol, name, fred, freq, aliases = [], country = 'US', weight = 1, note) => ({
  id: 'rate:' + symbol, type: 'rate', symbol, name, country, unit: '%', providers: { fred, freq }, aliases, weight, ...(note ? { note } : {}),
});
export const RATES = [
  rate('US3M', 'US Treasury 3 bulan', 'DGS3MO', 'd', ['UST3M']),
  rate('US2Y', 'US Treasury 2 tahun', 'DGS2', 'd', ['UST2Y', 'US 2Y'], 'US', 2),
  rate('US5Y', 'US Treasury 5 tahun', 'DGS5', 'd', ['UST5Y']),
  rate('US10Y', 'US Treasury 10 tahun', 'DGS10', 'd', ['UST', 'UST10Y', 'US 10Y', 'TNX'], 'US', 4),
  rate('US30Y', 'US Treasury 30 tahun', 'DGS30', 'd', ['UST30Y']),
  rate('US10YR', 'Imbal hasil riil 10 tahun (TIPS)', 'DFII10', 'd', ['TIPS', 'REAL YIELD']),
  rate('US2S10S', 'Spread 10 tahun − 2 tahun', 'T10Y2Y', 'd', ['2S10S', '2Y10Y', 'CURVE'], 'US', 2),
  rate('US3M10Y', 'Spread 10 tahun − 3 bulan', 'T10Y3M', 'd', ['3M10Y']),
  rate('EFFR', 'Fed funds efektif', 'DFF', 'd', ['FED FUNDS', 'FEDFUNDS'], 'US', 2),
  rate('SOFR', 'Secured Overnight Financing Rate', 'SOFR', 'd'),
  rate('US5YBE', 'Ekspektasi inflasi 5 tahun (breakeven)', 'T5YIE', 'd', ['BREAKEVEN']),
  rate('HYOAS', 'Spread obligasi high-yield AS (OAS)', 'BAMLH0A0HYM2', 'd', ['HY SPREAD']),
  ...[['DE', 'Jerman', ['BUND']], ['JP', 'Jepang', ['JGB']], ['GB', 'Inggris', ['GILT']], ['FR', 'Prancis', ['OAT']], ['IT', 'Italia', ['BTP']], ['CA', 'Kanada', []], ['AU', 'Australia', []], ['KR', 'Korea Selatan', []]]
    .map(([c, n, a]) => rate(c + '10Y', `Obligasi pemerintah 10 tahun ${n}`, `IRLTLT01${c}M156N`, 'm', a, c, 1, 'Seri OECD bulanan (rata-rata bulan), bukan harga harian.')),
];

/* bank sentral (sama dengan CB_LIST di halaman makro), dengan singkatan yang umum dipakai */
export const CENTRAL_BANKS = [
  ['US', 'Federal Reserve', ['FED', 'FOMC', 'THE FED']], ['XM', 'European Central Bank', ['ECB']], ['JP', 'Bank of Japan', ['BOJ']],
  ['GB', 'Bank of England', ['BOE']], ['CN', "People's Bank of China", ['PBOC']], ['CH', 'Swiss National Bank', ['SNB']],
  ['AU', 'Reserve Bank of Australia', ['RBA']], ['NZ', 'Reserve Bank of New Zealand', ['RBNZ']], ['ID', 'Bank Indonesia', ['BI']],
  ['KR', 'Bank of Korea', ['BOK']], ['SG', 'Monetary Authority of Singapore', ['MAS']], ['PH', 'Bangko Sentral ng Pilipinas', ['BSP']],
  ['IN', 'Reserve Bank of India', ['RBI']], ['CA', 'Bank of Canada', ['BOC']], ['BR', 'Banco Central do Brasil', ['BCB']],
  ['MX', 'Banco de México', ['BANXICO']], ['TR', 'Central Bank of the Republic of Türkiye', ['CBRT', 'TCMB']], ['ZA', 'South African Reserve Bank', ['SARB']],
].map(([country, name, aliases]) => ({ id: 'central_bank:' + country, type: 'central_bank', symbol: aliases[0], name, country, providers: { bis: country }, aliases: aliases.slice(1), weight: 1 }));

export const SEED = [...STOCKS, ...ETFS, ...INDICES, ...CRYPTO, ...FX, ...COMMODITIES, ...RATES, ...CENTRAL_BANKS];

/* ---------- pembentuk entitas dari data referensi yang sudah ada di aplikasi ---------- */

/* COUNTRY_META baris: [iso3, iso2, numerik, nama EN, nama ID, mata uang, lat, lon, region, subregion, ibu kota, merdeka] */
const BIG = new Set(['US', 'CN', 'JP', 'DE', 'IN', 'GB', 'FR', 'IT', 'BR', 'CA', 'KR', 'RU', 'AU', 'MX', 'ID', 'SA', 'TR', 'AR', 'ZA']);
/* sebutan umum yang tidak ada di data referensi */
const COUNTRY_ALIAS = {
  US: ['USA', 'AMERICA', 'AMERIKA', 'UNITED STATES OF AMERICA'], GB: ['UK', 'BRITAIN', 'INGGRIS', 'GREAT BRITAIN'], AE: ['UAE', 'EMIRATES'],
  KR: ['KOREA', 'KORSEL'], CN: ['CHINA', 'PRC', 'RRT'], RU: ['RUSIA'], NL: ['HOLLAND', 'BELANDA'], DE: ['JERMAN'], JP: ['JEPANG'], SA: ['SAUDI', 'ARAB SAUDI'],
};
export function countryEntities(meta) {
  return (meta || []).filter(r => r && r[0] && r[1]).map(r => ({
    id: 'country:' + r[0], type: 'country', symbol: r[1], name: r[4] || r[3],
    aliases: [...new Set([r[0], r[3], r[10], ...(COUNTRY_ALIAS[r[1]] || [])].filter(Boolean))], country: r[1], currency: r[5] || '',
    region: r[8] || '', weight: BIG.has(r[1]) ? 2 : 0,
  }));
}
/* THEMES dari shared/analytics.mjs -> topik berita yang bisa dicari */
export function topicEntities(themes) {
  return Object.entries(themes || {}).map(([k, t]) => ({
    id: 'topic:' + k, type: 'topic', symbol: k.toUpperCase(), name: t.label, aliases: (t.kw || []).slice(0, 6), weight: 0,
  }));
}
/* CHOKE_REF dari halaman kapal: [id, nama EN, nama pendek, lat, lon, catatan] */
export function chokepointEntities(ref) {
  return (ref || []).map(r => ({
    id: 'chokepoint:' + r[0], type: 'chokepoint', symbol: r[0].toUpperCase(), name: r[1], aliases: [r[2], 'SELAT ' + r[2]], lat: r[3], lon: r[4], weight: 0,
  }));
}
