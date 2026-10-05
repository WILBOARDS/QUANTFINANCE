import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const file = 'file://' + process.cwd() + '/dist/quant-terminal.html';
const wait = ms => new Promise(r => setTimeout(r, ms));
const SAFE = process.env.SAFE === '1';
const args = [...chromium.args.filter(a => !(SAFE && /single-process|no-zygote/.test(a))), '--no-sandbox', '--lang=en-US'];
let browser;
async function launch() { browser = await puppeteer.launch({ args, executablePath: await chromium.executablePath(), headless: 'shell' }); }
await launch();
const results = [];
async function scenario(name, vp, fn) {
  if (!browser.connected) { await launch(); }
  const page = await browser.newPage();
  const errs = [];
  page.on('error', e => errs.push('CRASH: ' + e.message));
  page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e.stack || e).slice(0, 260)));
  page.on('console', m => { if (m.type() === 'error' && !/403/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  try {
    await page.setViewport(vp);
    await page.goto(file, { waitUntil: 'load' });
    await wait(1800);
    const note = await fn(page);
    results.push(`OK   ${name}${note ? ' -> ' + JSON.stringify(note) : ''}${errs.length ? '  [!] ' + errs.join(' | ') : ''}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${String(e.message).slice(0, 140)} ${errs.join(' | ')}`);
  }
  try { await page.close(); } catch {}
}
const D = { width: 1440, height: 900 };
const mapBox = p => p.evaluate(() => { const r = document.getElementById('mapTop').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });

await scenario('A pasar (1440x900)', D, async p => { await wait(800); await p.screenshot({ path: '/tmp/a1.png' }); });
await scenario('B hover Indonesia', D, async p => {
  const b = await mapBox(p); const xy = await p.evaluate(() => MARKETS.ID.xy);
  await p.mouse.move(b.x + xy[0], b.y + xy[1]); await wait(500);
  await p.screenshot({ path: '/tmp/a2.png', clip: { x: b.x, y: b.y - 50, width: b.w, height: b.h + 50 } });
  return { tip: await p.evaluate(() => !document.getElementById('mapTip').hidden) };
});
await scenario('C klik Jepang (mouse asli)', D, async p => {
  const b = await mapBox(p); const xy = await p.evaluate(() => MARKETS.JP.xy);
  await p.mouse.move(b.x + xy[0] - 30, b.y + xy[1] - 30);
  await p.mouse.move(b.x + xy[0], b.y + xy[1]);
  await wait(300);
  await p.mouse.click(b.x + xy[0], b.y + xy[1]); await wait(1500);
  const r = await p.evaluate(() => ({ sym: document.getElementById('cSym').textContent, chip: document.querySelector('#chips [aria-pressed=true]').textContent, count: document.getElementById('wCount').textContent }));
  await p.screenshot({ path: '/tmp/a3.png' });
  return r;
});
await scenario('D NVDA 1D area', D, async p => {
  await p.click('#rows li[data-sym="NVDA"] .row'); await wait(500);
  await p.click('#tfSeg [data-tf="1D"]'); await wait(500);
  await p.click('#typeSeg [data-type="area"]'); await wait(900);
  await p.screenshot({ path: '/tmp/a4.png', clip: { x: 0, y: 440, width: 1040, height: 460 } });
});
await scenario('E jam bursa', D, async p => {
  const b = await mapBox(p);
  await p.click('.map-card .seg [data-view="hours"]'); await wait(700);
  await p.screenshot({ path: '/tmp/a5.png', clip: { x: 0, y: 90, width: 1050, height: 400 } });
});
await scenario('F halaman kas', D, async p => { await p.click('.nav [data-page="cash"]'); await wait(900); await p.screenshot({ path: '/tmp/a6.png', fullPage: true }); });
await scenario('G metodologi + pengaturan', D, async p => {
  await p.click('.nav [data-page="about"]'); await wait(400); await p.screenshot({ path: '/tmp/a7.png' });
  await p.click('.nav [data-page="market"]'); await wait(500);
  await p.click('#btnSettings'); await wait(400); await p.screenshot({ path: '/tmp/a8.png' });
});
await scenario('H mobile 390', { width: 390, height: 844, deviceScaleFactor: 1 }, async p => {
  await wait(600);
  const o = await p.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, vw: innerWidth, off: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.tape')).slice(0, 6).map(e => e.tagName + '.' + (e.className.baseVal ?? e.className) + ':' + Math.round(e.getBoundingClientRect().right)) }));
  await p.screenshot({ path: '/tmp/a9.png', fullPage: true }); return o;
});
await scenario('I tablet 1024', { width: 1024, height: 768 }, async p => { await wait(600); await p.screenshot({ path: '/tmp/a10.png', fullPage: true }); });
await scenario('J laptop 1366x768', { width: 1366, height: 768 }, async p => { await wait(600); await p.screenshot({ path: '/tmp/a11.png', fullPage: true }); });
await scenario('K klik Jepang lalu ringkasan', D, async p => {
  await p.evaluate(() => bus.emit('pickMarket', 'JP')); await wait(700);
  await p.screenshot({ path: '/tmp/a12.png', clip: { x: 650, y: 480, width: 400, height: 400 } });
  return await p.evaluate(() => document.querySelectorAll('#healthBody .mini-list button').length + ' saham di ringkasan');
});
console.log(results.join('\n'));
await browser.close().catch(() => {});
