/* Grafik pro (G1-G6): indikator teknikal, mode bandingkan (normalisasi), tab Teknikal (TECH),
   dan sumber hanya-penutupan (FRED). Mode server = server lokal + sumber palsu berformat asli.
   Harness otomatis menggagalkan skenario bila ada error JS, promise ditolak, console.error,
   atau loading macet (lihat qa/harness.mjs). */
const S = { mode: 'server' };
const ALL = ['sma20', 'sma50', 'ema20', 'bb20', 'vwap', 'rsi14', 'macd', 'atr14', 'vol20'];
const run = async (p, text) => {
  await p.click('#cmdInput');
  await p.fill('#cmdInput', text);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
};
const until = async (p, fn, arg, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await p.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await p.waitForTimeout(250);
  }
};
const chartReady = (p, tf) => until(p, t => { const c = SecurityPage.chart; return c && !c.state.loading && c.state.bars > 0 && (!t || c.state.tf === t) ? c.state : null; }, tf || null);
const note = (p, id) => p.evaluate(x => {
  const n = document.querySelector(`.pc-notes [data-study-note="${x}"]`);
  return n ? { text: n.textContent.replace(/\s+/g, ' ').trim(), calc: !!n.querySelector('.q-calculated'), na: !!n.querySelector('.q-unavailable'), lin: n.querySelectorAll('.lin').length } : null;
}, id);
const toggle = async (p, id) => { await p.click(`.pc-studies [data-study="${id}"]`); await p.waitForTimeout(150); };
const noBadText = async (p, where) => {
  const bad = await p.evaluate(() => (document.getElementById('page-security').innerText.match(/.{0,30}(\bNaN\b|\bundefined\b|\[object Object\]|Infinity).{0,30}/g) || []).slice(0, 3));
  if (bad.length) throw new Error(where + ': teks rusak ' + JSON.stringify(bad));
};
const linPop = async (p, sel) => {
  await p.click(sel); await p.waitForTimeout(200);
  const t = await p.textContent('#linPop');
  await p.keyboard.press('Escape');
  return t;
};

export default async function (h) {
  await h.scenario('G1 BTC GP: semua indikator bisa dinyalakan, catatan berisi periode/sumber/basis + Kalkulasi', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC GP');
    const st = await chartReady(p);
    if (!st) throw new Error('Grafik BTC tidak punya bar');
    const ids = await p.$$eval('.pc-studies [data-study]', e => e.map(x => x.dataset.study));
    for (const id of ALL) if (!ids.includes(id)) throw new Error('Tombol indikator hilang: ' + id + ' (ada: ' + ids + ')');
    const out = {};
    for (const id of ALL) {
      await toggle(p, id);
      const n = await note(p, id);
      const drawn = await p.evaluate(x => SecurityPage.chart.state.drawn.includes(x), id);
      if (!n) throw new Error('Catatan indikator tidak ada: ' + id);
      if (!drawn || !n.calc || !n.lin) throw new Error(`${id} tidak digambar/berlencana Kalkulasi: ${JSON.stringify(n)}`);
      if (!/periode/.test(n.text) || !/sumber: Binance/.test(n.text) || !/basis:/.test(n.text)) throw new Error(`${id} catatan kurang lengkap: ${n.text}`);
      out[id] = n.text.slice(0, 48);
    }
    const panes = await p.evaluate(() => document.getElementById('secChart').dataset.panes);
    if (panes !== '3') throw new Error('RSI/MACD/ATR harus punya 3 pita sendiri, dapat ' + panes);
    if (!/VWAP sejak awal rentang yang dimuat/.test((await note(p, 'vwap')).text)) throw new Error('Basis VWAP tidak ditulis');
    const pop = await linPop(p, '.pc-notes [data-study-note="rsi14"] .lin');
    if (!/Kalkulasi/.test(pop) || !/Rumus/.test(pop) || !/Wilder/.test(pop)) throw new Error('Asal-usul RSI tidak lengkap: ' + pop.slice(0, 200));
    await noBadText(p, 'G1');
    await p.hover('#secChart .pc-host', { position: { x: 200, y: 120 } }); await p.waitForTimeout(200);
    const leg = await p.textContent('#secChart .pc-legend');
    await h.shot(p, 'G1-indikator');
    for (const id of ALL) await toggle(p, id);
    const after = await p.evaluate(() => ({ drawn: SecurityPage.chart.state.drawn.length, notes: document.querySelector('.pc-notes').hidden, panes: document.getElementById('secChart').dataset.panes }));
    if (after.drawn || !after.notes || after.panes !== '0') throw new Error('Indikator tidak bisa dimatikan: ' + JSON.stringify(after));
    return { pita: panes, legenda: leg.slice(0, 120) };
  }, S);

  await h.scenario('G2 RSI14 di rentang 5D (bar 4 jam), SMA50 data kurang ditulis jujur, VWAP 1D direset harian', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC GP');
    await chartReady(p);
    await p.click('.pc-tf [data-tf="5D"]');
    const st = await chartReady(p, '5D');
    if (!st) throw new Error('5D tidak memuat bar');
    await toggle(p, 'rsi14'); await toggle(p, 'sma50');
    const rsi = await note(p, 'rsi14'), sma = await note(p, 'sma50');
    const drawn = await p.evaluate(() => SecurityPage.chart.state.drawn);
    if (st.bars >= 15 ? !drawn.includes('rsi14') || !rsi.calc : !/RSI14 butuh minimal 15 bar; tersedia \d+/.test(rsi.text)) throw new Error('RSI 5D salah: ' + JSON.stringify({ bars: st.bars, rsi }));
    if (!/bar 4 jam/.test(rsi.text)) throw new Error('Lebar bar tidak ditulis: ' + rsi.text);
    if (st.bars < 50 && (drawn.includes('sma50') || !sma.na || !new RegExp(`SMA50 butuh minimal 50 bar; tersedia ${st.bars}`).test(sma.text))) throw new Error('SMA50 data kurang tidak jujur: ' + JSON.stringify(sma));
    await h.shot(p, 'G2-rsi-5d');
    await p.click('.pc-tf [data-tf="1D"]');
    await chartReady(p, '1D');
    await toggle(p, 'vwap');
    const vw = await until(p, () => { const n = document.querySelector('.pc-notes [data-study-note="vwap"]'); return n && SecurityPage.chart.state.tf === '1D' ? n.textContent : null; });
    if (!/direset tiap hari UTC/.test(vw || '')) throw new Error('VWAP 1D tidak menyebut reset harian: ' + vw);
    await noBadText(p, 'G2');
    return { bar5D: st.bars, rsi: rsi.text.slice(0, 70), sma50: sma.text.slice(0, 60) };
  }, S);

  await h.scenario('G3 bandingkan BTC dengan ETH: garis dinormalisasi 100, sumbu %, sumber & kualitas tiap seri', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC GP');
    await chartReady(p);
    await toggle(p, 'sma20'); await toggle(p, 'rsi14');
    /* input salah dulu: pesan jelas, tidak ada error */
    await p.fill('.pc-cmp-in', 'BTC'); await p.click('.pc-cmp button[type="submit"]');
    if (!/grafik utama/.test(await p.textContent('.pc-cmp-msg'))) throw new Error('Membandingkan dengan diri sendiri tidak ditolak');
    await p.fill('.pc-cmp-in', 'ZQXJW'); await p.click('.pc-cmp button[type="submit"]');
    if (!/Tidak dikenal/.test(await p.textContent('.pc-cmp-msg'))) throw new Error('Kode salah tidak memberi pesan');
    await p.fill('.pc-cmp-in', 'ETH'); await p.click('.pc-cmp button[type="submit"]');
    const st = await until(p, () => { const s = SecurityPage.chart.state; return s.normalized && s.compare.length === 1 && s.compare[0].loaded ? s : null; });
    if (!st || st.compare[0].id !== 'crypto:ETH') throw new Error('Mode bandingkan tidak aktif: ' + JSON.stringify(st));
    const r = await p.evaluate(() => {
      const foot = document.querySelector('#secChart .pc-foot');
      const row = k => { const n = document.querySelector(`.pc-notes [data-cmp-series="${k}"]`); return n ? { text: n.textContent.replace(/\s+/g, ' '), badge: !!n.querySelector('.qb'), lin: !!n.querySelector('.lin') } : null; };
      return { foot: foot.textContent, calc: !!foot.querySelector('.pc-axis .q-calculated'), main: row('main'), eth: row('crypto:ETH'), chip: document.querySelector('.pc-chips').textContent, legend: document.querySelector('#secChart .pc-legend').textContent };
    });
    if (!/% \(awal = 100\)/.test(r.foot) || !r.calc) throw new Error('Sumbu % (awal = 100) + Kalkulasi tidak ada: ' + r.foot);
    if (!r.main || !r.eth || !r.main.badge || !r.eth.badge || !r.eth.lin || !/Binance/.test(r.eth.text) || !/Binance/.test(r.main.text)) throw new Error('Sumber/kualitas tiap seri tidak ada: ' + JSON.stringify(r));
    if (!/BTC/.test(r.legend) || !/ETH/.test(r.legend)) throw new Error('Legenda tidak memuat kedua seri: ' + r.legend);
    const sma = await note(p, 'sma20');
    if (!/mode bandingkan/.test(sma.text)) throw new Error('Overlay harga tidak dijelaskan di mode bandingkan: ' + sma.text);
    if (!(await p.evaluate(() => SecurityPage.chart.state.drawn.includes('rsi14')))) throw new Error('RSI (skala sendiri) hilang di mode bandingkan');
    const pop = await linPop(p, '.pc-notes [data-cmp-series="crypto:ETH"] .lin');
    if (!/Kalkulasi/.test(pop) || !/awal bersama/.test(pop)) throw new Error('Asal-usul kinerja tidak lengkap: ' + pop.slice(0, 200));
    await p.click('.pc-tf [data-tf="1M"]');
    const tf = await until(p, () => { const s = SecurityPage.chart.state; return s.tf === '1M' && s.normalized && s.compare[0].loaded ? s : null; });
    if (!tf) throw new Error('Ganti rentang membuang mode bandingkan');
    await noBadText(p, 'G3');
    await h.shot(p, 'G3-bandingkan');
    await p.click('.pc-chips [data-cmp-del="crypto:ETH"]'); await p.waitForTimeout(200);
    const off = await p.evaluate(() => SecurityPage.chart.state);
    if (off.normalized || off.compare.length) throw new Error('Hapus pembanding tidak kembali ke harga: ' + JSON.stringify(off));
    return { kaki: r.foot.replace(/\s+/g, ' ').slice(0, 140), eth: r.eth.text.slice(0, 80) };
  }, S);

  await h.scenario('G4 BTC TECH: tabel nilai terakhir semua indikator dengan asal-usul + Analisis otomatis', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC TECH');
    const rows = await until(p, () => { const r = document.querySelectorAll('#secBody .tech-table tbody tr'); return r.length && !document.querySelector('#secBody .loading') ? r.length : null; });
    if (rows !== 9) throw new Error('Baris indikator tidak 9: ' + rows);
    const tab = await p.$eval('#secTabs [aria-selected="true"]', e => e.textContent);
    if (!/Teknikal/.test(tab)) throw new Error('Tab aktif bukan Teknikal: ' + tab);
    const r = await p.evaluate(() => ({
      ok: [...document.querySelectorAll('#secBody .tech-table tbody tr')].filter(t => t.dataset.ok === 'true').map(t => t.dataset.tech),
      lin: document.querySelectorAll('#secBody .tech-table .lin').length,
      txt: document.getElementById('secBody').innerText,
      rsi: document.querySelector('#secBody [data-tech="rsi14"]').innerText.replace(/\s+/g, ' '),
    }));
    if (r.ok.length !== 9) throw new Error('Indikator yang tersedia untuk BTC 1Y: ' + r.ok);
    if (r.lin < 13) throw new Error('Nilai tidak bisa diklik ke asal-usulnya: ' + r.lin);
    if (!/Analisis otomatis, bukan rekomendasi/.test(r.txt)) throw new Error('Label analisis otomatis tidak ada');
    if (!/ambang umum|Netral/.test(r.rsi)) throw new Error('Bacaan RSI tidak ada: ' + r.rsi);
    const pop = await linPop(p, '#secBody [data-tech="macd"] .lin');
    if (!/Kalkulasi/.test(pop) || !/Rumus/.test(pop) || !/Binance/.test(pop) || !/EMA12/.test(pop)) throw new Error('Asal-usul MACD tidak lengkap: ' + pop.slice(0, 200));
    await h.shot(p, 'G4-tech');
    await p.click('#secBody [data-ttf="5D"]');
    const sma50 = await until(p, () => { const t = document.querySelector('#secBody [data-tech="sma50"]'); return t && t.dataset.ok === 'false' ? t.innerText.replace(/\s+/g, ' ') : null; });
    if (!/Tidak tersedia: SMA50 butuh minimal 50 bar; tersedia \d+/.test(sma50 || '')) throw new Error('SMA50 5D tidak jujur: ' + sma50);
    await noBadText(p, 'G4');
    return { indikator: r.ok.length, angka: r.lin, rsi: r.rsi.slice(0, 90) };
  }, S);

  await h.scenario('G5 US10Y (FRED, hanya penutupan): ATR/VWAP/volume tidak tersedia dengan alasan, bukan NaN', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'US10Y GP');
    const st = await chartReady(p);
    if (!st) throw new Error('Grafik US10Y tidak punya bar');
    for (const id of ['atr14', 'vwap', 'vol20', 'rsi14']) await toggle(p, id);
    const n = {};
    for (const id of ['atr14', 'vwap', 'vol20', 'rsi14']) n[id] = await note(p, id);
    const drawn = await p.evaluate(() => SecurityPage.chart.state.drawn);
    if (drawn.includes('atr14') || !n.atr14.na || !/butuh high\/low/.test(n.atr14.text)) throw new Error('ATR FRED salah: ' + JSON.stringify(n.atr14));
    if (drawn.includes('vwap') || !n.vwap.na || !/butuh volume/.test(n.vwap.text)) throw new Error('VWAP FRED salah: ' + JSON.stringify(n.vwap));
    if (drawn.includes('vol20') || !/butuh volume/.test(n.vol20.text)) throw new Error('Volume FRED salah: ' + JSON.stringify(n.vol20));
    if (!drawn.includes('rsi14') || !/FRED/.test(n.rsi14.text)) throw new Error('RSI dari penutupan FRED harus tetap jalan: ' + JSON.stringify(n.rsi14));
    await noBadText(p, 'G5 grafik');
    await h.shot(p, 'G5-fred-grafik');
    await run(p, 'US10Y TECH');
    const rows = await until(p, () => { const r = document.querySelectorAll('#secBody .tech-table tbody tr'); return r.length && !document.querySelector('#secBody .loading') ? [...r].map(t => [t.dataset.tech, t.dataset.ok, t.innerText.replace(/\s+/g, ' ')]) : null; });
    if (!rows) throw new Error('Tabel teknikal US10Y tidak tampil');
    const get = id => rows.find(r => r[0] === id) || [];
    for (const id of ['atr14', 'vwap', 'vol20']) if (get(id)[1] !== 'false' || !/Tidak tersedia: .*butuh (high\/low|volume)/.test(get(id)[2])) throw new Error(id + ' US10Y: ' + JSON.stringify(get(id)));
    if (get('rsi14')[1] !== 'true' || get('sma20')[1] !== 'true') throw new Error('Indikator berbasis penutupan harus tersedia: ' + JSON.stringify(rows.map(r => r.slice(0, 2))));
    const co = await p.textContent('#secBody .src-line');
    if (!/hanya harga penutupan/.test(co)) throw new Error('Sumber tidak menyebut hanya-penutupan: ' + co);
    await noBadText(p, 'G5 TECH');
    return { atr: get('atr14')[2].slice(-80), vwap: get('vwap')[2].slice(-80) };
  }, S);

  await h.scenario('G6 HP 390 px: indikator + bandingkan + Teknikal tanpa scroll horizontal', async (p, { base }) => {
    await p.goto(base); await p.waitForTimeout(2500);
    await run(p, 'BTC GP');
    await chartReady(p);
    for (const id of ['rsi14', 'macd', 'bb20']) await toggle(p, id);
    await p.fill('.pc-cmp-in', 'ETH'); await p.click('.pc-cmp button[type="submit"]');
    await until(p, () => SecurityPage.chart.state.normalized);
    const g = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await h.shot(p, 'G6-hp-grafik', { fullPage: true });
    await run(p, 'BTC TECH');
    await until(p, () => document.querySelectorAll('#secBody .tech-table tbody tr').length === 9);
    const t = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await h.shot(p, 'G6-hp-tech', { fullPage: true });
    if (g > 1 || t > 1) throw new Error('Overflow horizontal: ' + JSON.stringify({ grafik: g, tech: t }));
    return { grafik: g, tech: t };
  }, { ...S, vp: { width: 390, height: 844 } });
}
