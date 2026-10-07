/* Cari kemungkinan kebocoran kunci API / rahasia di:
   - file yang dilacak git (source, docs, test)
   - dist/quant-terminal.html (yang dibuka di browser)
   - riwayat git (semua commit) bila git tersedia
   - file .env TIDAK boleh dilacak git
   Jalankan: npm run secrets   (keluar dengan kode 1 bila ada temuan) */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
import { PATTERNS } from './secret-patterns.mjs';
/* contoh/placeholder yang memang boleh ada */
const ALLOW = [/qa\/fake-upstream\.mjs/, /scripts\/(check-secrets|secret-patterns)\.mjs/, /test\/secrets\.test\.mjs/];

const findings = [];
function scan(label, text) {
  if (ALLOW.some(a => a.test(label))) return;
  const lines = text.split(/\r?\n/);
  lines.forEach((ln, i) => { for (const [name, re] of PATTERNS) if (re.test(ln)) findings.push(`${label}:${i + 1}  ${name}: ${ln.trim().slice(0, 120)}`); });
}
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

let hasGit = true;
try { git(['rev-parse', '--is-inside-work-tree']); } catch { hasGit = false; }

if (hasGit) {
  const tracked = git(['ls-files']).split('\n').filter(Boolean);
  if (tracked.some(f => /(^|\/)\.env$/.test(f))) findings.push('.env DILACAK git: hapus dengan "git rm --cached .env"');
  for (const f of tracked) {
    if (/\.(woff2|png|jpg|ico|zip)$/.test(f) || f === 'package-lock.json') continue;
    try { scan(f, readFileSync(join(root, f), 'utf8')); } catch { /* biner/hilang */ }
  }
  try {
    /* hanya baris yang ditambahkan di seluruh riwayat */
    const log = git(['log', '--all', '-p', '--no-color', '--unified=0', '--', '.', ':!package-lock.json', ':!dist', ':!vendor']);
    let cur = '', file = '';
    for (const ln of log.split('\n')) {
      if (ln.startsWith('commit ')) cur = ln.slice(7, 15);
      else if (ln.startsWith('+++ ')) file = ln.slice(4).replace(/^b\//, '');
      else if (ln.startsWith('+')) scan(`riwayat ${cur} ${file}`, ln.slice(1));
    }
  } catch (e) { console.warn('Riwayat git tidak bisa dibaca: ' + e.message); }
}
const dist = join(root, 'dist/quant-terminal.html');
if (existsSync(dist)) scan('dist/quant-terminal.html', readFileSync(dist, 'utf8'));
/* kalau ada .env lokal, pastikan isinya tidak bocor ke dist */
const envFile = join(root, '.env');
if (existsSync(envFile) && existsSync(dist)) {
  const d = readFileSync(dist, 'utf8');
  for (const m of readFileSync(envFile, 'utf8').matchAll(/^\s*([A-Z0-9_]*(?:KEY|TOKEN|SECRET)[A-Z0-9_]*)\s*=\s*['"]?([^'"\s#]{8,})/gm)) {
    if (d.includes(m[2])) findings.push(`Nilai ${m[1]} dari .env ditemukan di dist/quant-terminal.html`);
  }
}

if (findings.length) {
  console.error('KEMUNGKINAN RAHASIA BOCOR:\n' + [...new Set(findings)].map(f => '  ' + f).join('\n'));
  process.exit(1);
}
console.log(`Tidak ada rahasia terdeteksi (${hasGit ? 'file terlacak + riwayat git + ' : ''}dist).`);
