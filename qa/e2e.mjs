/* Tes browser end-to-end. Jalankan: npm run e2e
   Filter skenario: npm run e2e -- negara    (hanya skenario yang namanya mengandung "negara")
                    npm run e2e -- D        (kode saja = semua skenario yang ID-nya diawali "D": D1, D2, ...)
   Skenario ada di qa/scenarios/*.mjs (diurutkan menurut nama file). Setiap file mengekspor
   default async (h) => { await h.scenario('nama', async (page, ctx) => {...}, { mode, vp }) }. */
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHarness } from './harness.mjs';

const filter = (process.argv[2] || '').toLowerCase();
let h;
try { h = await createHarness(); }
catch (e) { console.error(e.message); process.exit(2); }
console.log(`Browser: ${h.browserInfo.path} (${h.browserInfo.via})`);

const dir = fileURLToPath(new URL('./scenarios/', import.meta.url));
const scenario = h.scenario;
const byId = /^[a-z]\d*$/.test(filter);
const match = name => { const n = name.toLowerCase(); return byId ? n.split(' ')[0].startsWith(filter) : n.includes(filter); };
if (filter) h.scenario = (name, fn, opts) => (match(name) ? scenario(name, fn, opts) : Promise.resolve());
for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()) {
  const mod = await import(pathToFileURL(dir + f).href);
  await mod.default(h);
}
await h.close();
console.log(h.results.join('\n'));
console.log(h.fails ? `\n${h.fails} skenario bermasalah` : `\nSemua ${h.results.length} skenario lolos`);
process.exit(h.fails ? 1 : 0);
