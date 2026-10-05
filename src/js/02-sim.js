/* =====================================================================
   SIMULASI: jam bursa, riwayat harga sintetis, dan tick real-time
   Semua harga di sini PALSU (acak). Tujuannya agar tampilan hidup.
   ===================================================================== */

/* ---------- jam bursa dihitung dari zona waktu ---------- */
const _dtf = {};
function tzParts(tz, date) {
  const f = _dtf[tz] || (_dtf[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
  return { dow, min: (+o.hour) * 60 + (+o.minute) };
}
function sessionsFor(m, dow) {
  const days = m.days || [1, 2, 3, 4, 5];
  if (!days.includes(dow)) return [];
  return (dow === 5 && m.sessFri) ? m.sessFri : m.sess;
}
function dur(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h >= 24) return Math.floor(h / 24) + 'h ' + (h % 24) + 'j';
  return h ? h + 'j ' + m + 'm' : m + 'm';
}
function marketStatus(id, date = new Date()) {
  const m = MARKETS[id];
  if (!m) return { open: true, label: 'Buka', detail: 'perdagangan 24 jam' };
  const { dow, min } = tzParts(m.tz, date);
  for (const [s, e] of sessionsFor(m, dow)) {
    if (min >= s && min < e) return { open: true, label: 'Buka', detail: 'tutup dalam ' + dur(e - min) };
  }
  for (let off = 0; off < 8; off++) {
    for (const [s] of sessionsFor(m, (dow + off) % 7)) {
      const t = off * 1440 + s - min;
      if (t > 0) return { open: false, label: 'Tutup', detail: 'buka dalam ' + dur(t) };
    }
  }
  return { open: false, label: 'Tutup', detail: '' };
}
/* cache 15 detik supaya hemat */
const _stCache = {};
function statusOf(id) {
  const now = Date.now();
  const c = _stCache[id];
  if (c && now - c.t < 15000) return c.v;
  const v = marketStatus(id, new Date(now));
  _stCache[id] = { t: now, v };
  return v;
}
function isOpen(inst) {
  return State.forceOpen || inst.mkt === 'CRYPTO' || statusOf(inst.mkt).open;
}
function openCount() {
  const ids = Object.keys(MARKETS);
  return [ids.filter(id => statusOf(id).open).length, ids.length];
}

/* ---------- riwayat sintetis ---------- */
const INTRA_STEP = 300;     // bar 5 menit
const INTRA_N = 96;

function buildIntraday(inst) {
  const rng = makeRng(inst.sym + '-intra');
  const end = Math.floor(Date.now() / 1000 / INTRA_STEP) * INTRA_STEP;
  const sigma = inst.vol / Math.sqrt(78) * 0.9;
  const z = [], cum = [0];
  for (let i = 0; i < INTRA_N; i++) { z.push(rng.normal() * sigma); cum.push(cum[i] + z[i]); }
  const target = Math.log(inst.price / inst.open);
  const drift = (target - cum[INTRA_N]) / INTRA_N; // jembatan: bar terakhir tepat di harga sekarang
  const bars = [];
  let prevC = inst.open;
  for (let i = 0; i < INTRA_N; i++) {
    const c = inst.open * Math.exp(cum[i + 1] + drift * (i + 1));
    const wig = Math.abs(rng.normal()) * sigma * 0.5;
    bars.push({
      time: end - (INTRA_N - 1 - i) * INTRA_STEP,
      open: prevC, high: Math.max(prevC, c) * (1 + wig), low: Math.min(prevC, c) * (1 - wig), close: c,
      volume: inst.volBase / 78 * (0.4 + rng() * 1.2),
    });
    prevC = c;
  }
  return bars;
}

function buildDaily(inst) {
  const rng = makeRng(inst.sym + '-daily');
  const N = 1300;
  const days = [];
  let d = new Date(); d.setUTCHours(0, 0, 0, 0);
  while (days.length < N) {
    const dow = d.getUTCDay();
    if (inst.type === 'crypto' || (dow !== 0 && dow !== 6)) days.push(d.getTime() / 1000);
    d = new Date(d.getTime() - 86400000);
  }
  days.reverse();
  const mu = ((hashStr(inst.sym + 'mu') % 1000) / 1000 - 0.3) * inst.vol * 0.10;
  let closes = [1];
  for (let i = 1; i < N; i++) closes.push(closes[i - 1] * Math.exp(mu + inst.vol * rng.normal() * 0.9));
  const k = inst.prev / closes[N - 2]; // kemarin = harga tutup kemarin
  closes = closes.map(c => c * k);
  const bars = [];
  for (let i = 0; i < N - 1; i++) {
    const c = closes[i];
    const o = i ? closes[i - 1] * (1 + rng.normal() * inst.vol * 0.15) : c;
    const up = Math.abs(rng.normal()) * inst.vol * 0.5, dn = Math.abs(rng.normal()) * inst.vol * 0.5;
    bars.push({
      time: days[i], open: o, high: Math.max(o, c) * (1 + up), low: Math.min(o, c) * (1 - dn), close: c,
      volume: inst.volBase * (0.6 + rng() * 0.9),
    });
  }
  bars.push({ time: days[N - 1], open: inst.open, high: inst.high, low: inst.low, close: inst.price, volume: inst.volume });
  return bars;
}

function ensureIntra(inst) {
  if (!inst.intra) {
    inst.intra = buildIntraday(inst);
    for (const b of inst.intra) { inst.high = Math.max(inst.high, b.high); inst.low = Math.min(inst.low, b.low); }
    inst.spark = inst.intra.slice(-40).map(b => b.close);
  }
  return inst.intra;
}
function ensureDaily(inst) {
  if (!inst.daily) inst.daily = buildDaily(inst);
  return inst.daily;
}
INSTS.forEach(ensureIntra);

/* ---------- tick ---------- */
const GAIN = 6;          // pembesar supaya gerakan terlihat di layar
function stepInst(inst) {
  const sigma = inst.vol / Math.sqrt(23400) * GAIN;
  const pull = 0.0012 * Math.log(inst.anchor / inst.price); // tarik pelan ke harga dasar
  inst.price *= Math.exp(sigma * gauss() + pull);
  if (inst.price > inst.high) inst.high = inst.price;
  if (inst.price < inst.low) inst.low = inst.price;
  if (inst.volBase) inst.volume += inst.volBase / 23400 * (0.5 + Math.random()) * 4;
}
function touchBars(inst) {
  const b = Math.floor(Date.now() / 1000 / INTRA_STEP) * INTRA_STEP;
  let last = inst.intra[inst.intra.length - 1];
  if (b > last.time) {
    last = { time: b, open: inst.price, high: inst.price, low: inst.price, close: inst.price, volume: 0 };
    inst.intra.push(last);
    if (inst.intra.length > 500) inst.intra.shift();
  } else {
    last.close = inst.price;
    last.high = Math.max(last.high, inst.price);
    last.low = Math.min(last.low, inst.price);
  }
  if (inst.daily) {
    const d = inst.daily[inst.daily.length - 1];
    d.close = inst.price; d.high = inst.high; d.low = inst.low; d.volume = inst.volume;
  }
}
function pct(inst) { return inst.price / inst.prev - 1; }

function simTick() {
  const changed = [];
  for (const inst of INSTS) {
    if (inst.live) continue;
    if (!isOpen(inst)) continue;
    stepInst(inst);
    touchBars(inst);
    inst.tickCount++;
    if (inst.tickCount % 5 === 0) { inst.spark.push(inst.price); if (inst.spark.length > 40) inst.spark.shift(); }
    changed.push(inst);
  }
  if (changed.length) bus.emit('tick', changed);
}
