/* Cek lingkungan sebelum build/tes. Jalankan: npm run doctor */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = m => console.log('  OK    ' + m);
const no = (m, fix) => { bad++; console.log('  GAGAL ' + m + (fix ? '\n        -> ' + fix : '')); };
const warn = (m, fix) => console.log('  INFO  ' + m + (fix ? '\n        -> ' + fix : ''));

console.log('QuantTerminal doctor');
const major = +process.versions.node.split('.')[0];
major >= 22 ? ok('Node ' + process.versions.node) : no('Node ' + process.versions.node + ' (butuh 22+)', 'Pasang Node LTS dari https://nodejs.org');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const [name, want] of Object.entries(pkg.devDependencies || {})) {
  const p = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(p)) { no(`${name} belum terpasang`, 'npm ci'); continue; }
  const have = JSON.parse(readFileSync(p, 'utf8')).version;
  have === want ? ok(`${name}@${have}`) : no(`${name}@${have} (dikunci ${want})`, 'npm ci');
}
for (const f of ['plus-jakarta-sans-latin-wght-normal.woff2', 'ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-latin-500-normal.woff2', 'ibm-plex-mono-latin-600-normal.woff2']) {
  existsSync(join(root, 'vendor/fonts', f)) ? ok('font ' + f) : warn('font ' + f + ' hilang (build tetap jalan dengan font sistem)', 'git checkout vendor/fonts');
}
existsSync(join(root, 'dist/quant-terminal.html')) ? ok('dist/quant-terminal.html ada') : warn('dist belum di-build', 'npm run build');
existsSync(join(root, '.env')) ? ok('.env ada (kunci dibaca server)') : warn('.env belum ada (opsional)', 'salin .env.example menjadi .env');
try {
  const { findBrowser } = await import('../qa/browser.mjs');
  const b = findBrowser();
  ok(`browser untuk E2E: ${b.path} (${b.via})`);
} catch (e) { warn('browser untuk E2E belum ada: ' + e.message.split('\n')[0], 'npm run e2e:install  atau set CHROME_PATH'); }

console.log(bad ? `\n${bad} masalah harus diperbaiki.` : '\nLingkungan siap.');
process.exit(bad ? 1 : 0);
