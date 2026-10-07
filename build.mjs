/* Gabungkan semua sumber jadi SATU file HTML (font, grafik, peta, kode ikut tertanam).
   Jalankan: npm ci, lalu npm run build  ->  dist/quant-terminal.html

   Supaya build bisa diulang (reproducible) dan tidak patah karena versi paket berubah:
   - Font disimpan di repo (vendor/fonts, lisensi OFL), bukan diambil dari node_modules.
   - Library dicari lewat package.json-nya, dengan beberapa kandidat path, dan versi
     dicek terhadap versi yang dikunci di package.json proyek. Pesan error menyebut
     paket mana yang hilang dan cara memperbaikinya.
   - Tidak perlu Python. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(root, 'package.json'));
const read = p => readFileSync(p, 'utf8');
const warnings = [];

class BuildError extends Error {}

/* cari folder sebuah paket. Banyak paket membatasi "exports" sehingga require.resolve('x/package.json')
   gagal; karena itu cari juga node_modules dari folder proyek ke atas (seperti algoritma Node). */
function pkgDir(name) {
  try { return dirname(require.resolve(name + '/package.json')); } catch { /* lanjut cari manual */ }
  for (let d = root; ; d = dirname(d)) {
    const p = join(d, 'node_modules', name, 'package.json');
    if (existsSync(p)) return dirname(p);
    if (dirname(d) === d) break;
  }
  throw new BuildError(`Paket "${name}" tidak ditemukan. Jalankan "npm ci" di folder proyek.`);
}
/* file pertama yang ada dari beberapa kandidat path di dalam paket */
function pkgFile(name, candidates) {
  const dir = pkgDir(name);
  for (const c of candidates) { const p = join(dir, c); if (existsSync(p)) return p; }
  const v = JSON.parse(read(join(dir, 'package.json'))).version;
  throw new BuildError(`File tidak ditemukan di ${name}@${v}: ${candidates.join(' | ')}. Versi paket mungkin berubah; jalankan "npm ci" supaya memakai versi di package-lock.json.`);
}
/* peringatkan bila versi terpasang berbeda dari versi yang dikunci proyek */
const projectPkg = JSON.parse(read(join(root, 'package.json')));
function checkVersion(name) {
  const want = (projectPkg.devDependencies || {})[name] || (projectPkg.dependencies || {})[name];
  const have = JSON.parse(read(join(pkgDir(name), 'package.json'))).version;
  if (want && /^\d/.test(want) && want !== have) warnings.push(`${name}: terpasang ${have}, dikunci ${want}. Jalankan "npm ci".`);
  return have;
}

/* ---------- font (dari repo; kalau hilang, build tetap jalan dengan font sistem) ---------- */
const FONT_DIR = join(root, 'vendor/fonts');
function fontFace(family, file, weight) {
  const p = join(FONT_DIR, file);
  if (!existsSync(p)) { warnings.push(`Font ${file} tidak ada di vendor/fonts; memakai font sistem.`); return ''; }
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(p).toString('base64')}) format("woff2");}\n`;
}
const fonts = fontFace('Plus Jakarta Sans', 'plus-jakarta-sans-latin-wght-normal.woff2', '200 800') +
  [400, 500, 600].map(w => fontFace('IBM Plex Mono', `ibm-plex-mono-latin-${w}-normal.woff2`, w)).join('');

function build() {
  /* ---------- library ---------- */
  const versions = {};
  for (const n of ['lightweight-charts', 'd3-array', 'd3-geo', 'world-atlas', 'world-countries', 'i18n-iso-countries']) versions[n] = checkVersion(n);
  const lwc = read(pkgFile('lightweight-charts', ['dist/lightweight-charts.standalone.production.js', 'dist/lightweight-charts.standalone.production.mjs']));
  const d3 = read(pkgFile('d3-array', ['dist/d3-array.min.js', 'dist/d3-array.js'])) + '\n' + read(pkgFile('d3-geo', ['dist/d3-geo.min.js', 'dist/d3-geo.js']));

  /* ---------- data referensi statis (bukan data pasar) ---------- */
  const topo = JSON.parse(read(pkgFile('world-atlas', ['countries-110m.json'])));
  const land50 = JSON.parse(read(pkgFile('world-atlas', ['land-50m.json'])));
  const wc = JSON.parse(read(pkgFile('world-countries', ['countries.json', 'dist/countries.json'])));
  const idNames = JSON.parse(read(pkgFile('i18n-iso-countries', ['langs/id.json']))).countries;
  if (!topo.objects || !topo.objects.countries) throw new BuildError('world-atlas: format countries-110m.json tidak dikenal');
  const meta = wc
    .filter(c => c.cca3 && c.cca2)
    .map(c => {
      const idn = idNames[c.cca2];
      return [
        c.cca3, c.cca2, c.ccn3 || '',
        c.name.common,
        Array.isArray(idn) ? idn[0] : (idn || c.name.common),
        Object.keys(c.currencies || {})[0] || '',
        Math.round((c.latlng?.[0] ?? 0) * 100) / 100,
        Math.round((c.latlng?.[1] ?? 0) * 100) / 100,
        c.region || '', c.subregion || '',
        (c.capital || [])[0] || '',
        c.independent ? 1 : 0,
      ];
    });
  const world = 'const WORLD_TOPO = ' + JSON.stringify(topo) + ';\n' +
    '/* garis pantai detail 1:50m, hanya dipakai saat globe di-zoom dekat (selat, pelabuhan) */\n' +
    'const LAND50_TOPO = ' + JSON.stringify(land50) + ';\n' +
    '/* [iso3, iso2, numerik, nama EN, nama ID, mata uang, lat, lon, region, subregion, ibu kota, merdeka] */\n' +
    'const COUNTRY_META = ' + JSON.stringify(meta) + ';\n' +
    'const BUILD_INFO = ' + JSON.stringify({ builtAt: new Date().toISOString(), version: projectPkg.version, libs: versions }) + ';';

  /* ---------- modul bersama (shared/*.mjs) dibungkus jadi namespace ----------
     Contoh: shared/parsers.mjs -> const Parsers = (() => { ...; return { parseWorldBank, ... }; })();
     Dengan begitu nama fungsi di sana tidak bentrok dengan kode src/js. */
  function wrapShared(file, ns) {
    const src = read(join(root, 'shared', file));
    const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    if (/^import\s/m.test(src)) throw new BuildError(`shared/${file} tidak boleh memakai import (dibungkus jadi script biasa di browser)`);
    const body = src.replace(/^export\s+/gm, '');
    return `/* ===== shared/${file} ===== */\nconst ${ns} = (() => {\n${body}\nreturn { ${names.join(', ')} };\n})();\n`;
  }
  const SHARED = [['parsers.mjs', 'Parsers'], ['analytics.mjs', 'Analytics']];
  for (const f of readdirSync(join(root, 'shared')).filter(f => f.endsWith('.mjs'))) {
    if (!SHARED.some(([n]) => n === f)) SHARED.push([f, f.replace(/\.mjs$/, '').replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())]);
  }
  const shared = SHARED.map(([f, ns]) => wrapShared(f, ns)).join('');

  /* ---------- kode aplikasi: semua file src/js diurutkan menurut nama ---------- */
  const jsDir = join(root, 'src/js');
  const jsFiles = readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
  const js = shared + jsFiles.map(f => `/* ===== ${f} ===== */\n` + read(join(jsDir, f))).join('\n');

  /* ---------- halaman & gaya tambahan: src/pages/*.html dan src/css/*.css (urut nama file) ----------
     Fitur baru menaruh halamannya di file sendiri supaya template utama tidak jadi satu file raksasa. */
  const listDir = d => (existsSync(join(root, d)) ? readdirSync(join(root, d)).sort() : []);
  const pageFiles = listDir('src/pages').filter(f => f.endsWith('.html'));
  const cssFiles = listDir('src/css').filter(f => f.endsWith('.css'));
  const pages = pageFiles.map(f => `<!-- ===== src/pages/${f} ===== -->\n` + read(join(root, 'src/pages', f))).join('\n');
  const css = read(join(root, 'src/style.css')) + cssFiles.map(f => `\n/* ===== src/css/${f} ===== */\n` + read(join(root, 'src/css', f))).join('');
  for (const f of pageFiles) if (/<script/i.test(read(join(root, 'src/pages', f)))) throw new BuildError(`src/pages/${f} tidak boleh berisi <script>; taruh kode di src/js`);

  const safe = s => s.replace(/<\/script/gi, '<\\/script');
  let html = read(join(root, 'src/template.html'));
  const put = (key, val) => {
    if (!html.includes(key)) throw new BuildError('Penanda tidak ditemukan di template: ' + key);
    html = html.replace(key, () => val);
  };
  put('/*__FONTS__*/', fonts);
  put('/*__CSS__*/', css);
  put('<!--__PAGES__-->', pages);
  put('/*__LWC__*/', safe(lwc));
  put('/*__D3__*/', safe(d3));
  put('/*__WORLD__*/', safe(world));
  put('/*__JS__*/', safe(js));

  mkdirSync(join(root, 'dist'), { recursive: true });
  const out = join(root, 'dist/quant-terminal.html');
  writeFileSync(out, html);
  return { out, jsFiles, size: statSync(out).size, shared: SHARED.map(s => s[1]), pages: pageFiles.length, cssFiles: cssFiles.length };
}

try {
  const r = build();
  for (const w of warnings) console.warn('PERINGATAN: ' + w);
  console.log(`OK ${r.out}  ${(r.size / 1024).toFixed(0)} KB  (${r.jsFiles.length} file JS, ${r.pages} halaman tambahan, ${r.cssFiles} file CSS tambahan, modul bersama: ${r.shared.join(', ')})`);
} catch (e) {
  console.error('BUILD GAGAL: ' + e.message);
  if (!(e instanceof BuildError)) console.error(e.stack);
  process.exit(1);
}
