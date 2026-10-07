/* =====================================================================
   WIKIDATA: profil peran publik tokoh dan perusahaan (CC0)
   Endpoint MediaWiki API publik, tanpa kunci (https://www.wikidata.org/w/api.php):
     action=wbsearchentities&search=...&language=en&type=item&limit=7
     action=wbgetentities&ids=Q1|Q2&props=labels|descriptions|claims|sitelinks|info&languages=id|en
     action=wbgetentities&ids=...&props=labels&languages=id|en          (label untuk QID rujukan)
   Klaim diringkas DI SERVER lewat shared/wikidata.mjs: hanya properti ALLOW, properti data pribadi
   (BLOCK) dibuang sebelum dikirim ke browser. Wikidata mendukung CORS (origin=*), jadi browser tanpa
   server boleh memanggil langsung dengan parser yang sama.
   ===================================================================== */
import * as W from '../../shared/wikidata.mjs';

export default ctx => {
  const { viaCache, need, upstream } = ctx;
  const API = 'https://www.wikidata.org/w/api.php';
  const headers = { 'User-Agent': 'QuantTerminal/2.1 (aplikasi lokal; data peran publik)', Accept: 'application/json' };
  const ids = q => {
    const v = need(q.get('ids'), /^Q[1-9]\d{0,9}(\|Q[1-9]\d{0,9}){0,49}$/, 'ids');
    return [...new Set(v.split('|'))].sort().join('|');
  };
  return {
    providers: [['wikidata', { name: 'Wikidata (CC0)', kind: 'Profil tokoh & perusahaan', auth: 'tanpa kunci', configured: true, limit: 'API publik; di-cache 24 jam', homepage: 'https://www.wikidata.org/wiki/Wikidata:Data_access', quality: 'historical' }]],
    gates: { wikidata: new ctx.Bucket(3, 1) },
    connect: ['https://www.wikidata.org'],
    routes: {
      '/api/wikidata/search': async q => {
        const s = need(q.get('q'), /^[^<>{}\\]{2,80}$/, 'q').trim();
        const url = `${API}?action=wbsearchentities&search=${encodeURIComponent(s)}&language=en&uselang=en&type=item&limit=7&format=json`;
        return viaCache('wikidata', 'wds:' + s.toLowerCase(), 24 * 3600e3, url, async () => W.parseSearch(await upstream(url, { headers, timeout: 10000 })));
      },
      '/api/wikidata/entities': async q => {
        const list = ids(q);
        const url = `${API}?action=wbgetentities&ids=${list}&props=labels|descriptions|claims|sitelinks|info&languages=id|en&format=json`;
        return viaCache('wikidata', 'wde:' + list, 24 * 3600e3, url, async () => {
          const raw = await upstream(url, { headers, timeout: 12000 });
          if (!raw || !raw.entities) throw new Error('Format wbgetentities tidak dikenal');
          return Object.values(raw.entities).filter(e => e && !e.missing && W.QID_RE.test(e.id || '')).map(e => W.parseEntity(e));
        });
      },
      '/api/wikidata/labels': async q => {
        const list = ids(q);
        const url = `${API}?action=wbgetentities&ids=${list}&props=labels&languages=id|en&format=json`;
        return viaCache('wikidata', 'wdl:' + list, 7 * 86400e3, url, async () => W.parseLabels(await upstream(url, { headers, timeout: 10000 })));
      },
    },
  };
};
