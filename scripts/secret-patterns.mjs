/* Pola rahasia yang dicari oleh check-secrets.mjs (dipisah supaya bisa diuji). */
export const PATTERNS = [
  ['Kunci AWS', /AKIA[0-9A-Z]{16}/],
  ['Token GitHub', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['Kunci Anthropic/OpenAI', /sk-(?:ant-)?[A-Za-z0-9_-]{24,}/],
  ['Kunci Google API', /AIza[0-9A-Za-z_-]{35}/],
  ['Kunci privat', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  /* nilai yang diisi untuk variabel kunci proyek ini (bukan nama variabelnya) */
  ['Isi kunci .env', /\b(?:AISSTREAM_API_KEY|FINNHUB_API_KEY|FRED_API_KEY|COINGECKO_DEMO_KEY|ALPHA_VANTAGE_API_KEY|EIA_API_KEY)\s*=\s*['"]?([A-Za-z0-9]{12,})/],
  ['Token di URL', /[?&](?:token|apikey|api_key)=(?!\*\*\*|\$\{|KEY|uji\b|x\b)[A-Za-z0-9]{16,}/i],
];
