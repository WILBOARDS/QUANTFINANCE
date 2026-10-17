/* =====================================================================
   PALSU-UNTUK-UJI: Wikidata API (www.wikidata.org/w/api.php), format JSON asli.
   HANYA untuk qa/e2e.mjs dan tes. Label diberi "[UJI]". Sengaja memuat klaim data pribadi
   (tanggal lahir, pasangan, alamat, foto) untuk membuktikan aplikasi MEMBUANGNYA.
   ===================================================================== */
const json = o => ({ status: 200, type: 'application/json', body: JSON.stringify(o) });
const it = (id, q) => ({ mainsnak: { snaktype: 'value', property: 'x', datavalue: { type: 'wikibase-entityid', value: { 'entity-type': 'item', 'numeric-id': +id.slice(1), id } } }, rank: 'normal', ...(q ? { qualifiers: q } : {}) });
const tm = (t, p = 11) => [{ snaktype: 'value', datavalue: { type: 'time', value: { time: t, precision: p, timezone: 0, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' } } }];
const str = v => ({ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: v } }, rank: 'normal' });
const L = { Q5: 'manusia', Q30: 'Amerika Serikat', Q865: 'Taiwan', Q43845: 'pengusaha', Q484876: 'chief executive officer', Q182477: '[UJI] Nvidia', Q11461: '[UJI] LSI Logic', Q305177: '[UJI] Jensen Huang', Q4830453: 'perusahaan', Q82059: 'NASDAQ', Q7432: '[UJI] Chris Malachowsky', Q2283: '[UJI] Curtis Priem', Q62: 'Santa Clara', Q11032: 'semikonduktor', Q6581097: 'laki-laki', Q42: '[UJI] Pasangan Pribadi' };
const ENT = {
  Q305177: { labels: { en: { language: 'en', value: '[UJI] Jensen Huang' } }, descriptions: { en: { language: 'en', value: '[UJI] pengusaha Amerika, pendiri Nvidia' } }, sitelinks: { enwiki: { site: 'enwiki', title: 'Jensen Huang' } },
    claims: { P31: [it('Q5')], P106: [it('Q43845')], P27: [it('Q30'), it('Q865')], P108: [it('Q182477', { P39: [{ snaktype: 'value', datavalue: { value: { id: 'Q484876' } } }], P580: tm('+1993-04-05T00:00:00Z') }), it('Q11461', { P580: tm('+1985-00-00T00:00:00Z', 9), P582: tm('+1993-00-00T00:00:00Z', 9) })],
      P569: [{ mainsnak: tm('+1963-02-17T00:00:00Z')[0], rank: 'normal' }], P26: [it('Q42')], P21: [it('Q6581097')], P18: [str('UJI_Foto_Pribadi.jpg')], P6375: [str('Jalan Pribadi 123')], P968: [str('mailto:pribadi@example.invalid')] } },
  Q182477: { labels: { en: { language: 'en', value: '[UJI] Nvidia' } }, descriptions: { en: { language: 'en', value: '[UJI] perusahaan teknologi Amerika' } }, sitelinks: { enwiki: { site: 'enwiki', title: 'Nvidia' } },
    claims: { P31: [it('Q4830453')], P169: [it('Q305177', { P580: tm('+1993-04-05T00:00:00Z') })], P112: [it('Q305177'), it('Q7432'), it('Q2283')], P249: [{ ...str('NVDA'), qualifiers: { P414: [{ snaktype: 'value', datavalue: { value: { id: 'Q82059' } } }] } }], P414: [it('Q82059')], P159: [it('Q62')], P452: [it('Q11032')], P17: [it('Q30')],
      P571: [{ mainsnak: tm('+1993-04-05T00:00:00Z')[0], rank: 'normal' }], P856: [str('https://example.test/nvidia')] } },
  Q11461: { labels: { en: { value: '[UJI] LSI Logic' } }, descriptions: { en: { value: '[UJI] perusahaan semikonduktor' } }, claims: { P31: [it('Q4830453')] } },
};
const SEARCH = { jensen: ['Q305177'], huang: ['Q305177'], nvidia: ['Q182477'], lsi: ['Q11461'] };
export default function wikidata(url) {
  if (url.hostname !== 'www.wikidata.org' || url.pathname !== '/w/api.php') return null;
  const a = url.searchParams.get('action');
  if (a === 'wbsearchentities') {
    const s = (url.searchParams.get('search') || '').toLowerCase();
    const hits = [...new Set(Object.entries(SEARCH).filter(([k]) => s.includes(k)).flatMap(([, v]) => v))];
    return json({ searchinfo: { search: s }, search: hits.map(id => ({ id, title: id, pageid: 1, concepturi: 'http://www.wikidata.org/entity/' + id, label: ENT[id].labels.en.value, description: ENT[id].descriptions.en.value, match: { type: 'label', language: 'en', text: ENT[id].labels.en.value } })), success: 1 });
  }
  if (a === 'wbgetentities') {
    const ids = (url.searchParams.get('ids') || '').split('|');
    const props = url.searchParams.get('props') || '';
    const entities = {};
    for (const id of ids) {
      if (ENT[id] && props.includes('claims')) entities[id] = { type: 'item', id, modified: '2026-09-01T10:00:00Z', ...ENT[id] };
      else if (L[id] || ENT[id]) entities[id] = { type: 'item', id, labels: { id: { language: 'id', value: L[id] || ENT[id].labels.en.value } } };
      else entities[id] = { id, missing: '' };
    }
    return json({ entities, success: 1 });
  }
  return json({ error: { code: 'badvalue', info: 'Unrecognized value for parameter "action"' } });
}
