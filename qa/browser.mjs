/* Cari browser Chromium untuk tes E2E, dengan urutan yang bisa ditebak:
   1. CHROME_PATH (kalau di-set, WAJIB ada; salah path = error jelas, bukan diam-diam pindah browser)
   2. Chromium milik playwright-core (hasil "npm run e2e:install", menghormati PLAYWRIGHT_BROWSERS_PATH)
   3. Chrome atau Edge yang terpasang di sistem (Windows, macOS, Linux)
   Kalau tidak ada satu pun: pesan berisi langkah perbaikan. */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

function systemCandidates() {
  const env = process.env;
  if (process.platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap(r => [join(r, 'Google/Chrome/Application/chrome.exe'), join(r, 'Microsoft/Edge/Application/msedge.exe'), join(r, 'Chromium/Application/chrome.exe')]);
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  }
  const out = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium'];
  for (const base of ['/opt/pw-browsers', join(env.HOME || '', '.cache/ms-playwright')]) {
    try { for (const d of readdirSync(base).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) out.push(join(base, d, 'chrome-linux/chrome')); } catch { /* tidak ada */ }
  }
  return out;
}

export function findBrowser() {
  const tried = [];
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return { path: process.env.CHROME_PATH, via: 'CHROME_PATH' };
    throw new Error(`CHROME_PATH di-set ke "${process.env.CHROME_PATH}" tapi file itu tidak ada. Perbaiki path-nya atau hapus variabel CHROME_PATH.`);
  }
  try {
    const p = chromium.executablePath();
    tried.push(p);
    if (p && existsSync(p)) return { path: p, via: 'playwright-core' };
  } catch { /* versi tanpa browser terunduh */ }
  for (const p of systemCandidates()) { tried.push(p); if (existsSync(p)) return { path: p, via: 'sistem' }; }
  throw new Error(['Tidak menemukan browser Chromium/Chrome/Edge untuk tes E2E.', 'Perbaiki dengan salah satu cara:',
    '  1. npm run e2e:install      (mengunduh Chromium yang cocok dengan playwright-core, sekali saja)',
    '  2. set CHROME_PATH=<path ke chrome.exe atau msedge.exe>   (Windows PowerShell: $env:CHROME_PATH="C:\\...\\msedge.exe")',
    'Lokasi yang sudah dicek:', ...tried.map(t => '  - ' + t)].join('\n'));
}

export async function launchBrowser() {
  const b = findBrowser();
  const browser = await chromium.launch({ executablePath: b.path, args: ['--no-sandbox'] });
  return { browser, info: b };
}
