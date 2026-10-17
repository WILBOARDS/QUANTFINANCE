/* =====================================================================
   INDIKATOR TEKNIKAL (murni, tanpa import; diuji di test/indicators.test.mjs)
   Masukan: deret angka, atau bar [{ time (detik UTC), open, high, low, close, volume }].
   Keluaran: larik SEJAJAR dengan masukan. null = belum cukup data (masa pemanasan),
   data bolong, atau sumber tidak punya bahan yang dibutuhkan (mis. volume).
   Aturan: TIDAK pernah mengarang nilai. Tidak ada isian 0 untuk masa pemanasan,
   tidak ada ekstrapolasi, tidak ada "volume 0" yang dianggap volume sungguhan.
   Bila ada nilai bolong di tengah, perhitungan berantai (EMA, RSI, ATR) mulai ulang
   dari awal setelah lubang itu, bukan menyambung diam-diam.
   ===================================================================== */

const fin = v => typeof v === 'number' && Number.isFinite(v);
const nulls = n => new Array(Math.max(0, n | 0)).fill(null);
/* volume dianggap ada hanya bila angka > 0. FRED/CoinGecko OHLC: volume 0/undefined = tidak ada. */
export const hasVolume = b => !!b && fin(b.volume) && b.volume > 0;
/* deret hanya-penutupan (FRED): high/low tidak ada, atau semuanya sama dengan close */
export function isCloseOnly(bars) {
  if (!Array.isArray(bars) || !bars.length) return false;
  return bars.every(b => !fin(b.high) || !fin(b.low) || (b.high === b.close && b.low === b.close && (!fin(b.open) || b.open === b.close)));
}

/* ---------- rata-rata bergerak sederhana ---------- */
export function sma(values, n) {
  const out = nulls(values.length);
  if (!(n >= 1)) return out;
  for (let i = n - 1; i < values.length; i++) {
    let s = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) { if (!fin(values[j])) { ok = false; break; } s += values[j]; }
    if (ok) out[i] = s / n;
  }
  return out;
}

/* ---------- rata-rata bergerak eksponensial ----------
   k = 2/(n+1). Nilai pertama = SMA dari n nilai valid pertama (bukan nilai pertama apa adanya). */
export function ema(values, n) {
  const out = nulls(values.length);
  if (!(n >= 1)) return out;
  const k = 2 / (n + 1);
  let prev = null, run = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!fin(v)) { prev = null; run = 0; continue; }
    run++;
    if (prev === null) {
      if (run < n) continue;
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += values[j];
      prev = s / n;
    } else prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/* ---------- RSI (Wilder) ----------
   Perubahan d = C_t − C_{t−1}. Rata-rata naik/turun pertama = rata-rata sederhana n perubahan
   pertama (butuh n+1 penutupan). Selanjutnya: rata = (rata_sebelumnya × (n−1) + nilai_baru) ÷ n.
   RSI = 100 − 100 ÷ (1 + rata naik ÷ rata turun). Rata turun 0 -> 100. Naik dan turun
   sama-sama 0 (harga datar) -> tidak terdefinisi (null), bukan 50 karangan. */
export function rsi(closes, n = 14) {
  const out = nulls(closes.length);
  if (!(n >= 1)) return out;
  let ag = null, al = null, run = 0, g = 0, l = 0;
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1], b = closes[i];
    if (!fin(a) || !fin(b)) { ag = al = null; run = 0; g = l = 0; continue; }
    const d = b - a, up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
    if (ag === null) {
      run++; g += up; l += dn;
      if (run < n) continue;
      ag = g / n; al = l / n;
    } else { ag = (ag * (n - 1) + up) / n; al = (al * (n - 1) + dn) / n; }
    out[i] = al === 0 ? (ag === 0 ? null : 100) : 100 - 100 / (1 + ag / al);
  }
  return out;
}

/* ---------- MACD ----------
   MACD = EMA(fast) − EMA(slow); sinyal = EMA(signal) dari garis MACD (awal = SMA 9 nilai MACD
   pertama); histogram = MACD − sinyal. Garis MACD ada mulai bar ke-slow, sinyal mulai bar ke-(slow+signal−1). */
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast), s = ema(closes, slow);
  const m = closes.map((_, i) => (f[i] !== null && s[i] !== null ? f[i] - s[i] : null));
  const sig = ema(m, signal);
  const hist = m.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null));
  return { macd: m, signal: sig, hist };
}

/* ---------- Bollinger ----------
   tengah = SMA(n); simpangan baku POPULASI jendela (bagi n, bukan n−1); pita = tengah ± k × sd. */
export function bollinger(closes, n = 20, k = 2) {
  const mid = sma(closes, n), upper = nulls(closes.length), lower = nulls(closes.length), sd = nulls(closes.length);
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] === null) continue;
    let s2 = 0;
    for (let j = i - n + 1; j <= i; j++) s2 += (closes[j] - mid[i]) ** 2;
    sd[i] = Math.sqrt(s2 / n);
    upper[i] = mid[i] + k * sd[i];
    lower[i] = mid[i] - k * sd[i];
  }
  return { mid, upper, lower, sd };
}

/* ---------- VWAP ----------
   Σ(harga tipikal × volume) ÷ Σ volume, harga tipikal = (H + L + C) ÷ 3, dijumlah sejak bar
   PERTAMA rentang yang dimuat. resetDaily: jumlah dimulai ulang tiap hari UTC (grafik intraday 1D).
   Bar tanpa volume (0/undefined) atau tanpa high/low: null dan tidak ikut dijumlah.
   closeOnly (FRED): semua null, karena tidak ada high/low maupun volume. */
export function vwap(bars, { resetDaily = false, closeOnly = false } = {}) {
  const out = nulls(bars.length);
  if (closeOnly) return out;
  let pv = 0, vv = 0, day = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (resetDaily && b && fin(b.time)) { const d = Math.floor(b.time / 86400); if (d !== day) { day = d; pv = 0; vv = 0; } }
    if (!hasVolume(b) || !fin(b.high) || !fin(b.low) || !fin(b.close)) continue;
    pv += (b.high + b.low + b.close) / 3 * b.volume;
    vv += b.volume;
    out[i] = pv / vv;
  }
  return out;
}

/* ---------- True range & ATR (Wilder) ----------
   TR_t = maks(H_t − L_t, |H_t − C_{t−1}|, |L_t − C_{t−1}|), butuh penutupan bar sebelumnya,
   jadi bar pertama tidak punya TR. ATR pertama = rata-rata sederhana n TR pertama (bar ke-n,
   butuh n+1 bar); selanjutnya ATR = (ATR_sebelumnya × (n−1) + TR) ÷ n. */
export function trueRange(bars, { closeOnly = false } = {}) {
  const out = nulls(bars.length);
  if (closeOnly) return out;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], pc = bars[i - 1] && bars[i - 1].close;
    if (!b || !fin(b.high) || !fin(b.low) || !fin(pc) || b.high < b.low) continue;
    out[i] = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  }
  return out;
}
export function atr(bars, n = 14, { closeOnly = false } = {}) {
  const out = nulls(bars.length);
  if (closeOnly || !(n >= 1)) return out;
  const tr = trueRange(bars);
  let prev = null, run = 0, s = 0;
  for (let i = 1; i < bars.length; i++) {
    const t = tr[i];
    if (t === null) { prev = null; run = 0; s = 0; continue; }
    if (prev === null) { run++; s += t; if (run < n) continue; prev = s / n; }
    else prev = (prev * (n - 1) + t) / n;
    out[i] = prev;
  }
  return out;
}

/* ---------- rata-rata volume ----------
   SMA volume n bar; volume 0/undefined = tidak ada data (null), BUKAN nol. */
export function volumeAvg(volumes, n = 20) {
  return sma(volumes.map(v => (fin(v) && v > 0 ? v : null)), n);
}

/* ---------- tabel indikator ----------
   needs: close = cukup penutupan; hl = butuh high/low; volume = butuh volume; hlv = keduanya.
   pane: true = digambar di skala sendiri di bawah grafik harga (bukan di skala harga). */
export const MIN_BARS = { sma20: 20, sma50: 50, ema20: 20, bb20: 20, vwap: 1, rsi14: 15, macd: 34, atr14: 15, vol20: 20 };
export const META = [
  { id: 'sma20', label: 'SMA20', title: 'Rata-rata bergerak sederhana 20 bar', period: '20', needs: 'close', pane: false,
    formula: 'SMA20 = (C₁ + … + C₂₀) ÷ 20, rata-rata 20 harga penutupan terakhir', basis: 'harga penutupan per bar' },
  { id: 'sma50', label: 'SMA50', title: 'Rata-rata bergerak sederhana 50 bar', period: '50', needs: 'close', pane: false,
    formula: 'SMA50 = (C₁ + … + C₅₀) ÷ 50, rata-rata 50 harga penutupan terakhir', basis: 'harga penutupan per bar' },
  { id: 'ema20', label: 'EMA20', title: 'Rata-rata bergerak eksponensial 20 bar', period: '20', needs: 'close', pane: false,
    formula: 'EMA_t = C_t × k + EMA_{t−1} × (1 − k), k = 2 ÷ (20 + 1); nilai awal = SMA 20 bar pertama', basis: 'harga penutupan per bar' },
  { id: 'bb20', label: 'Bollinger(20,2)', title: 'Pita Bollinger 20 bar, 2 simpangan baku', period: '20, 2σ', needs: 'close', pane: false,
    formula: 'tengah = SMA20; atas/bawah = tengah ± 2 × simpangan baku populasi 20 penutupan terakhir', basis: 'harga penutupan per bar; simpangan baku populasi (bagi n)' },
  { id: 'vwap', label: 'VWAP', title: 'Harga rata-rata tertimbang volume', period: 'sejak awal rentang', needs: 'hlv', pane: false,
    formula: 'VWAP = Σ(harga tipikal × volume) ÷ Σ volume, harga tipikal = (H + L + C) ÷ 3', basis: 'VWAP sejak awal rentang yang dimuat (grafik 1D: direset tiap hari UTC)' },
  { id: 'rsi14', label: 'RSI14', title: 'Relative Strength Index 14 bar (Wilder)', period: '14', needs: 'close', pane: true,
    formula: 'RSI = 100 − 100 ÷ (1 + RS), RS = rata-rata kenaikan ÷ rata-rata penurunan 14 bar (penghalusan Wilder)', basis: 'perubahan harga penutupan antar bar' },
  { id: 'macd', label: 'MACD(12,26,9)', title: 'Moving Average Convergence Divergence', period: '12, 26, 9', needs: 'close', pane: true,
    formula: 'MACD = EMA12 − EMA26; sinyal = EMA9 dari MACD; histogram = MACD − sinyal', basis: 'harga penutupan per bar' },
  { id: 'atr14', label: 'ATR14', title: 'Average True Range 14 bar (Wilder)', period: '14', needs: 'hl', pane: true,
    formula: 'TR = maks(H − L, |H − C sebelumnya|, |L − C sebelumnya|); ATR = rata-rata Wilder 14 TR', basis: 'high, low, dan penutupan bar sebelumnya' },
  { id: 'vol20', label: 'Rata-rata volume 20', title: 'Rata-rata volume 20 bar', period: '20', needs: 'volume', pane: false,
    formula: 'rata-rata sederhana volume 20 bar terakhir', basis: 'volume per bar dari sumber (bar tanpa volume tidak dihitung sebagai 0)' },
];
const BY_ID = Object.fromEntries(META.map(m => [m.id, m]));
export const metaOf = id => BY_ID[id] || null;

/* ---------- lebar bar (median selisih waktu) -> label ---------- */
export function barSeconds(bars) {
  const d = [];
  for (let i = 1; i < bars.length; i++) { const x = bars[i].time - bars[i - 1].time; if (fin(x) && x > 0) d.push(x); }
  if (!d.length) return null;
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}
export function barLabel(sec) {
  if (!fin(sec) || sec <= 0) return 'bar';
  if (sec < 3600) return Math.round(sec / 60) + ' menit';
  if (sec < 86400) return Math.round(sec / 3600) + ' jam';
  if (sec < 4 * 86400) return 'harian';
  if (sec < 20 * 86400) return 'mingguan';
  if (sec < 60 * 86400) return 'bulanan';
  return Math.round(sec / 86400) + ' hari';
}

/* ---------- hitung satu indikator + alasan bila tidak bisa ----------
   hasil: { id, ok, reason, lines: { nama: larik }, main: nama garis utama, lastIndex, last: { nama: nilai } }
   reason selalu kalimat yang bisa langsung ditampilkan ("RSI14 butuh minimal 15 bar; tersedia 7"). */
const MAIN = { sma20: 'sma', sma50: 'sma', ema20: 'ema', bb20: 'mid', vwap: 'vwap', rsi14: 'rsi', macd: 'macd', atr14: 'atr', vol20: 'avg' };
export function compute(id, bars, { closeOnly = false, resetDaily = false } = {}) {
  const m = BY_ID[id];
  const na = reason => ({ id, ok: false, reason, lines: {}, main: MAIN[id] || null, lastIndex: -1, last: {} });
  if (!m) return na('Indikator tidak dikenal: ' + id);
  const list = Array.isArray(bars) ? bars : [];
  const co = closeOnly || isCloseOnly(list);
  const vol = list.some(hasVolume);
  if (m.needs === 'hlv' && co) return na(`${m.label} butuh volume dan high/low; sumber ini hanya memberi harga penutupan`);
  if (m.needs === 'hl' && co) return na(`${m.label} butuh high/low; sumber ini hanya memberi harga penutupan`);
  if ((m.needs === 'volume' || m.needs === 'hlv') && !vol) return na(`${m.label} butuh volume; sumber ini tidak memberi volume`);
  if (list.length < MIN_BARS[id]) return na(`${m.label} butuh minimal ${MIN_BARS[id]} bar; tersedia ${list.length}`);
  const closes = list.map(b => b.close);
  let lines;
  switch (id) {
    case 'sma20': lines = { sma: sma(closes, 20) }; break;
    case 'sma50': lines = { sma: sma(closes, 50) }; break;
    case 'ema20': lines = { ema: ema(closes, 20) }; break;
    case 'bb20': { const b = bollinger(closes, 20, 2); lines = { upper: b.upper, mid: b.mid, lower: b.lower }; break; }
    case 'vwap': lines = { vwap: vwap(list, { resetDaily }) }; break;
    case 'rsi14': lines = { rsi: rsi(closes, 14) }; break;
    case 'macd': lines = macd(closes, 12, 26, 9); break;
    case 'atr14': lines = { atr: atr(list, 14) }; break;
    case 'vol20': lines = { avg: volumeAvg(list.map(b => b.volume), 20) }; break;
  }
  /* nilai terakhir = bar terakhir yang SEMUA garisnya punya nilai (MACD: garis, sinyal, histogram) */
  const keys = Object.keys(lines);
  let li = -1;
  for (let i = list.length - 1; i >= 0; i--) if (keys.every(k => lines[k][i] !== null)) { li = i; break; }
  if (li < 0) {
    const why = id === 'rsi14' ? 'harga tidak bergerak selama periode RSI (naik dan turun sama-sama 0)'
      : id === 'macd' ? 'deret penutupan bolong sehingga EMA tidak bisa disambung'
        : 'data bolong (nilai kosong di dalam jendela)';
    return { ...na(`${m.label} tidak terdefinisi: ${why}`), lines };
  }
  return { id, ok: true, reason: '', lines, main: MAIN[id], lastIndex: li, last: Object.fromEntries(keys.map(k => [k, lines[k][li]])) };
}

/* ---------- bacaan berbasis aturan (Analisis otomatis, BUKAN rekomendasi) ----------
   Ambang yang dipakai adalah ambang umum di buku teknikal, bukan sinyal beli/jual. */
const pc = (a, b) => { const x = (a / b - 1) * 100; return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1) + '%'; };
export function interpret(res, bars) {
  if (!res || !res.ok) return '';
  const i = res.lastIndex, c = bars[i] && bars[i].close, L = res.last, m = BY_ID[res.id];
  switch (res.id) {
    case 'sma20': case 'sma50': case 'ema20': {
      const v = L[res.main];
      if (!fin(c) || !(v > 0)) return '';
      return `Penutupan ${c >= v ? 'di atas' : 'di bawah'} ${m.label} (${pc(c, v)}).`;
    }
    case 'bb20': {
      if (!fin(c)) return '';
      if (c > L.upper) return 'Penutupan di atas pita atas (+2σ): jauh di atas rata-rata 20 bar menurut ambang umum.';
      if (c < L.lower) return 'Penutupan di bawah pita bawah (−2σ): jauh di bawah rata-rata 20 bar menurut ambang umum.';
      const w = L.upper - L.lower;
      return w > 0 ? `Di dalam pita; posisi ${Math.round((c - L.lower) / w * 100)}% dari pita bawah ke pita atas.` : 'Pita sangat sempit (harga hampir tidak bergerak).';
    }
    case 'vwap': {
      const v = L.vwap;
      if (!fin(c) || !(v > 0)) return '';
      return `Penutupan ${c >= v ? 'di atas' : 'di bawah'} VWAP rentang ini (${pc(c, v)}).`;
    }
    case 'rsi14': {
      const v = L.rsi;
      if (v > 70) return 'Jenuh beli menurut ambang umum 70.';
      if (v < 30) return 'Jenuh jual menurut ambang umum 30.';
      return 'Netral: di antara ambang umum 30 dan 70.';
    }
    case 'macd': {
      const h = L.hist, prev = i > 0 ? res.lines.hist[i - 1] : null;
      let t = h > 0 ? 'MACD di atas garis sinyal (histogram positif)' : h < 0 ? 'MACD di bawah garis sinyal (histogram negatif)' : 'MACD sama dengan garis sinyal';
      if (prev !== null && prev <= 0 && h > 0) t += '; baru memotong ke atas pada bar terakhir';
      else if (prev !== null && prev >= 0 && h < 0) t += '; baru memotong ke bawah pada bar terakhir';
      return t + `. Garis MACD ${L.macd >= 0 ? 'positif (EMA12 di atas EMA26)' : 'negatif (EMA12 di bawah EMA26)'}.`;
    }
    case 'atr14': {
      if (!(c > 0)) return '';
      return `Rentang rata-rata per bar ≈ ${(L.atr / c * 100).toFixed(2)}% dari harga penutupan.`;
    }
    case 'vol20': {
      const v = bars[i] && bars[i].volume, a = L.avg;
      if (!hasVolume(bars[i]) || !(a > 0)) return '';
      const r = v / a;
      return `Volume bar terakhir ${r.toFixed(2)}× rata-rata 20 bar${r >= 2 ? ' (jauh di atas rata-rata)' : r <= 0.5 ? ' (sepi)' : ''}.`;
    }
    default: return '';
  }
}
