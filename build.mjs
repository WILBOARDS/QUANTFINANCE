/* Gabungkan semua sumber jadi SATU file HTML (font, grafik, peta, kode ikut tertanam).
   Pengganti build.py: cukup Node, tidak perlu Python.
   Jalankan: npm install, lalu npm run build  ->  dist/quant-terminal.html */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const nm = join(root, 'node_modules');
const read = p => readFileSync(p, 'utf8');
const b64 = p => readFileSync(p).toString('base64');

/* ---------- font (tertanam, bukan CDN) ---------- */
const fonts = `
@font-face{font-family:"Plus Jakarta Sans";font-style:normal;font-weight:200 800;font-display:swap;
  src:url(data:font/woff2;base64,${b64(join(nm, '@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2'))}) format("woff2");}
` + [400, 500, 600].map(w => `@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:${w};font-display:swap;
  src:url(data:font/woff2;base64,${b64(join(nm, `@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${w}-normal.woff2`))}) format("woff2");}
`).join('');

/* ---------- library ---------- */
const lwc = read(join(nm, 'lightweight-charts/dist/lightweight-charts.standalone.production.js'));
const d3 = read(join(nm, 'd3-array/dist/d3-array.min.js')) + '\n' + read(join(nm, 'd3-geo/dist/d3-geo.min.js'));

/* ---------- data referensi statis (bukan data pasar) ----------
   Peta: Natural Earth 110m (world-atlas). Metadata negara: kode ISO, mata uang, ibu kota,
   koordinat (world-countries, ODbL) + nama Indonesia (i18n-iso-countries). */
const topo = JSON.parse(read(join(nm, 'world-atlas/countries-110m.json')));
const wc = JSON.parse(read(join(nm, 'world-countries/countries.json')));
const idNames = JSON.parse(read(join(nm, 'i18n-iso-countries/langs/id.json'))).countries;
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
  '/* [iso3, iso2, numerik, nama EN, nama ID, mata uang, lat, lon, region, subregion, ibu kota, merdeka] */\n' +
  'const COUNTRY_META = ' + JSON.stringify(meta) + ';';

/* ---------- kode aplikasi: semua file src/js diurutkan menurut nama ---------- */
const jsDir = join(root, 'src/js');
const jsFiles = readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const js = jsFiles.map(f => `/* ===== ${f} ===== */\n` + read(join(jsDir, f))).join('\n');

const safe = s => s.replace(/<\/script/gi, '<\\/script');
let html = read(join(root, 'src/template.html'));
const put = (key, val) => {
  if (!html.includes(key)) throw new Error('Penanda tidak ditemukan di template: ' + key);
  html = html.replace(key, () => val);
};
put('/*__FONTS__*/', fonts);
put('/*__CSS__*/', read(join(root, 'src/style.css')));
put('/*__LWC__*/', safe(lwc));
put('/*__D3__*/', safe(d3));
put('/*__WORLD__*/', safe(world));
put('/*__JS__*/', safe(js));

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist/quant-terminal.html');
writeFileSync(out, html);
console.log(`OK ${out}  ${(statSync(out).size / 1024).toFixed(0)} KB  (${jsFiles.length} file JS: ${jsFiles.join(', ')})`);
