/* =====================================================================
   FUNDAMENTAL SEC EDGAR: tab detail aset FA / EST / DIV / OWN / INSIDER (saham AS)
   - Sumber: SEC EDGAR lewat server (/api/sec/*): companyfacts (XBRL us-gaap) + submissions.
     Browser tidak bisa memanggil SEC langsung (tanpa CORS, wajib User-Agent berisi kontak).
   - Setiap angka bisa diklik: periode, konsep XBRL, nomor accession, tanggal lapor (filed),
     mata uang, kualitas. Rasio dan skor = "Kalkulasi" lengkap dengan rumus dan inputnya.
   - Konsep yang tidak dilaporkan tampil "–" / "Data kurang"; tidak pernah ditebak atau dianggap 0.
   - Rumus ada di shared/fundamentals.mjs (diuji); file ini hanya menampilkan.
   ===================================================================== */
SOURCE_DEFS.sec = { name: 'SEC EDGAR', kind: 'Fundamental AS', direct: false, server: true, auth: 'server (SEC_USER_AGENT di .env)', quality: 'historical', home: 'https://www.sec.gov/edgar/sec-api-documentation', limit: 'maks 10/detik (aturan SEC); di-cache 6–24 jam', fallback: null };
if (!SourceState.sec) SourceState.sec = { status: 'idle', requests: 0, cacheHits: 0, errors: 0, latency: null, lastOk: null, lastErr: null, lastErrMsg: '', via: null };

/* ---------- pengambilan data: ticker -> CIK -> companyfacts ringkas + submissions ---------- */
const FundData = (() => {
  const isUSStock = e => !!e && e.type === 'stock' && e.country === 'US' && !!(e.providers && e.providers.finnhub);
  async function cikOf(e, alive) {
    const P = e.providers || {};
    if (/^\d{10}$/.test(String(P.cik || ''))) return { ok: true, cik: P.cik };
    const tk = P.finnhub;
    const r = await getData('sec', { server: '/api/sec/cik?ticker=' + encodeURIComponent(tk), ttl: 24 * 3600e3, persist: true, key: 'sec:cik:' + tk, alive });
    return r.ok && r.data ? { ok: true, cik: r.data.cik, r } : { ok: false, r };
  }
  /* hasil: { ok, kind, cik, facts, subs, c (ringkas), s (submissions) } */
  async function load(e, alive) {
    if (!isUSStock(e)) return { ok: false, kind: 'nonus' };
    if (!Net.checked) await Net.ready();
    if (!Net.server) return { ok: false, kind: 'noserver' };
    const c = await cikOf(e, alive);
    if (alive && !alive()) return { ok: false, kind: 'cancel' };
    if (!c.ok) return { ok: false, kind: 'cik', r: c.r };
    const [facts, subs] = await Promise.all([
      getData('sec', { server: '/api/sec/facts?cik=' + c.cik, ttl: 12 * 3600e3, key: 'sec:facts:' + c.cik, timeout: 60000, alive }),
      getData('sec', { server: '/api/sec/filings?cik=' + c.cik, ttl: 6 * 3600e3, key: 'sec:subm:' + c.cik, timeout: 45000, alive }),
    ]);
    if (alive && !alive()) return { ok: false, kind: 'cancel' };
    if (!facts.ok) return { ok: false, kind: 'facts', r: facts, cik: c.cik };
    return { ok: true, cik: c.cik, facts, subs, c: facts.data, s: subs.ok ? subs.data : null };
  }
  /* kotak "tidak tersedia" sesuai sebab kegagalan */
  function failBox(e, what, m) {
    if (m.kind === 'nonus') {
      const ctry = e.country && C2.get(e.country) ? C2.get(e.country).name : (e.country || 'luar AS');
      return unavailableBox(what, { error: e.type === 'etf' ? 'ETF tidak menyampaikan laporan keuangan perusahaan (XBRL us-gaap) ke SEC, jadi data ini tidak tersedia dari sumber resmi gratis.' : `Fundamental resmi gratis hanya tersedia untuk perusahaan pelapor SEC (AS). ${e.name} tercatat di ${ctry}; laporan keuangannya tidak tersedia lewat API resmi gratis.` },
        esc('Untuk emiten IDX, laporan keuangan resmi ada di situs BEI dan emiten (PDF); belum ada API gratis yang andal.'));
    }
    if (m.kind === 'noserver') return unavailableBox(what, { error: 'Butuh server lokal: SEC EDGAR tidak bisa dipanggil langsung dari browser (tanpa CORS) dan mewajibkan User-Agent berisi kontak.' }, 'Jalankan <code>npm start</code>, isi <code>SEC_USER_AGENT</code> di <code>.env</code>, lalu buka http://localhost:8787.');
    const r = m.r || {};
    const ua = /SEC_USER_AGENT/.test(r.error || '');
    return unavailableBox(what, r, ua ? 'Contoh baris di <code>.env</code>: <code>SEC_USER_AGENT="Nama Kamu emailkamu@domain"</code> (pakai email aslimu), lalu jalankan ulang <code>npm start</code>.' : '');
  }
  return { load, isUSStock, failBox };
})();

/* ---------- tampilan ---------- */
const FundView = (() => {
  const F = Fundamentals;
  const S = { sub: Store.get('faSub', 'sum'), mode: Store.get('faMode', 'a'), fy: null, cur: null, seq: 0 };
  const SUBS = [['sum', 'Ringkasan'], ['is', 'Laba rugi'], ['bs', 'Neraca'], ['cf', 'Arus kas'], ['ratio', 'Rasio'], ['growth', 'Pertumbuhan'], ['val', 'Valuasi'], ['quality', 'Kualitas'], ['earn', 'Earnings'], ['div', 'Dividen'], ['own', 'Kepemilikan'], ['ins', 'Insider']];
  const ROWS = {
    is: ['revenue', 'costOfRevenue', 'grossProfit', 'operatingIncome', 'netIncome', 'epsDiluted', 'dilutedShares'],
    bs: ['assets', 'assetsCurrent', 'cash', 'liabilities', 'liabilitiesCurrent', 'longTermDebt', 'equity', 'retainedEarnings'],
    cf: ['cfo', 'capex', 'fcf', 'dividendsPaid'],
  };
  const TITLE = { is: 'Laba rugi', bs: 'Neraca', cf: 'Arus kas' };
  const kindOf = k => (k === 'epsDiluted' || k === 'dps' ? 'eps' : k === 'dilutedShares' ? 'sh' : 'usd');
  const def = k => F.FIELDS[k] || F.DERIVED[k] || { label: k };

  /* ---------- format angka ---------- */
  function short(v, kind) {
    if (!Number.isFinite(v)) return '–';
    switch (kind) {
      case 'eps': return fmt(v, 2);
      case 'pct': return fmt(v * 100, 1) + '%';
      case 'gpct': return (v >= 0 ? '+' : '−') + fmt(Math.abs(v * 100), 1) + '%';
      case 'x': return fmt(v, 2) + '×';
      case 'z': return fmt(v, 3);
      default: return v === 0 ? '0' : fmtCompact(v);
    }
  }
  const full = (v, kind) => (kind === 'eps' ? fmt(v, 2) : kind === 'pct' || kind === 'gpct' ? fmt(v * 100, 2) + '%' : kind === 'x' || kind === 'z' ? fmt(v, 4) : fmt(v, 0));
  const periodTxt = r => (r.isPrice ? 'harga ' + (r.asOf || r.fetchedAt || '') : `${F.periodLabel(r)} · ${r.start ? r.start + ' s/d ' + r.end : 'per ' + r.end}`);
  const conceptTxt = c => (!c ? '' : /[:−]/.test(c) ? c : 'us-gaap:' + c);
  const curOf = u => (/^[A-Z]{3}(\/shares)?$/.test(u || '') ? u.slice(0, 3) : '');
  function noteOf(m, r) {
    const parts = [`Form ${r.form || '–'} · dilaporkan (filed) ${r.filed || '–'} · accession ${r.accn || '–'}`];
    const idx = F.filingIndexUrl(m.cik, r.accn);
    if (idx) parts.push('dokumen: ' + idx);
    if (r.from) parts.push('dihitung dari: ' + r.from.map(x => `${x.form} ${x.accn} (${x.start ? x.start + '–' : ''}${x.end}) = ${fmt(x.value, 0)}`).join('; '));
    return parts.join(' · ');
  }
  /* satu nilai laporan (rec dari compactFacts) -> tombol asal-usul */
  function recLin(m, r, lbl, kind) {
    if (!r || !Number.isFinite(r.value)) return `<span class="na" title="${esc('Data kurang: ' + lbl + ' tidak dilaporkan untuk periode ini')}">–</span>`;
    return Lineage.wrap({
      label: lbl, value: full(r.value, kind), unit: r.unit, currency: curOf(r.unit), quality: r.quality === 'calculated' ? 'calculated' : m.facts.stale ? 'stale' : 'historical',
      source: 'SEC EDGAR companyfacts · ' + conceptTxt(r.concept), home: F.companyUrl(m.cik), url: m.facts.sourceUrl || F.factsUrl(m.cik), asOf: periodTxt(r),
      period: r.fp === 'FY' ? 'tahunan (laporan 10-K)' : 'kuartalan (10-Q' + (r.fp === 'Q4' ? '; Q4 dari 10-K' : '') + ')', fetchedAt: m.facts.fetchedAt, via: m.facts.via, formula: r.formula || '', note: noteOf(m, r),
    }, esc(short(r.value, kind)));
  }
  /* hasil kalkulasi (rasio, skor) -> tombol asal-usul; long = tulis "Data kurang" (bukan "–") */
  function calcLin(m, x, kind, lbl, long) {
    if (!x || x.value === null || x.value === undefined) {
      const why = (x && x.reason) || 'Data kurang';
      return long ? `<span class="na fa-dk" title="${esc(why)}">Data kurang</span>` : `<span class="na" title="${esc(why)}">–</span>`;
    }
    const ins = (x.inputs || []).filter(i => i.value !== null);
    const priced = ins.some(i => i.rec && i.rec.isPrice);
    const stale = m.facts.stale || ins.some(i => i.rec && i.rec.isPrice && i.rec.quality === 'stale');
    return Lineage.wrap({
      label: lbl || x.label, value: full(x.value, kind), quality: stale ? 'stale' : 'calculated',
      source: priced ? 'Kalkulasi: harga (' + ((ins.find(i => i.rec && i.rec.isPrice) || {}).rec || {}).source + ') + SEC EDGAR companyfacts' : 'Kalkulasi dari SEC EDGAR companyfacts',
      home: F.companyUrl(m.cik), url: m.facts.sourceUrl || F.factsUrl(m.cik), asOf: [...new Set(ins.map(i => i.period).filter(Boolean))].join(', '), fetchedAt: m.facts.fetchedAt, via: m.facts.via,
      formula: x.formula, note: 'Input: ' + ins.map(i => `${i.name} ${i.period ? '(' + i.period + ')' : ''} = ${full(i.value, i.rec && i.rec.unit === 'USD/shares' ? 'eps' : 'usd')}${i.concept ? ' [' + conceptTxt(i.concept) + ']' : ''}`).join('; '),
    }, esc(short(x.value, kind)));
  }
  const calcKind = x => (x.pct ? 'pct' : x.unit === '×' ? 'x' : 'usd');
  /* daftar input satu perhitungan (dipakai "Lihat perhitungan") */
  function inputsHtml(m, x) {
    return `<ul class="fa-inputs">${(x.inputs || []).map(i => {
      const r = i.rec;
      const v = !r ? `<span class="na fa-dk">Data kurang</span>` : r.isPrice ? Lineage.wrap({ label: 'Harga', value: fmt(r.value, 2), unit: r.unit, quality: r.quality || 'delayed', source: r.source, asOf: r.asOf, fetchedAt: r.fetchedAt }, esc(fmt(r.value, 2)))
        : r.formula && !r.concept ? Lineage.wrap({ label: i.name, value: full(r.value, 'usd'), unit: r.unit, quality: 'calculated', formula: r.formula, source: 'Kalkulasi' }, esc(short(r.value, 'usd'))) : recLin(m, r, i.name, r.unit === 'USD/shares' ? 'eps' : r.unit === 'shares' ? 'sh' : 'usd');
      return `<li><span>${esc(i.name)}</span><span class="meta">${esc(i.period || '')}${i.concept ? ' · ' + esc(conceptTxt(i.concept)) : ''}${r && r.filed ? ' · dilaporkan ' + esc(r.filed) : ''}</span><b>${v}</b></li>`;
    }).join('')}</ul>`;
  }
  const calcBtn = id => `<button type="button" class="mini-btn" data-fa-calc="${esc(id)}" aria-expanded="false" aria-controls="faCalc-${esc(id)}">Lihat perhitungan</button>`;
  const yearsTxt = cols => cols.map(c => c.label);

  /* ---------- tabel laporan: tahun/kuartal sebagai kolom, terbaru dulu ---------- */
  function columns(m, keys, mode) {
    const set = new Map();
    for (const k of keys) for (const r of (mode === 'a' ? m.c.annual[k] : m.c.quarterly[k]) || []) {
      const id = mode === 'a' ? String(r.fy) : r.fy + '|' + r.fp;
      const x = set.get(id);
      if (!x || r.end > x.end) set.set(id, { id, label: F.periodLabel(r), end: r.end });
    }
    return [...set.values()].sort((a, b) => (a.end < b.end ? 1 : -1)).slice(0, mode === 'a' ? 10 : 12);
  }
  const cellRec = (m, k, col, mode) => ((mode === 'a' ? m.c.annual[k] : m.c.quarterly[k]) || []).find(r => (mode === 'a' ? String(r.fy) : r.fy + '|' + r.fp) === col.id) || null;
  function statement(m, st, mode) {
    const keys = ROWS[st], cols = columns(m, keys, mode);
    if (!cols.length) return `<div class="na-box"><div>${qBadge('unavailable')} <strong>${esc(TITLE[st])}</strong></div><p>Data kurang: konsep XBRL untuk ${esc(TITLE[st].toLowerCase())} tidak ditemukan di companyfacts perusahaan ini (${esc(m.c.taxonomies.join(', ') || '–')}).</p></div>`;
    const filingRow = cols.map(c => { const r = keys.map(k => cellRec(m, k, c, mode)).find(x => x && !x.quality); const u = r && F.filingIndexUrl(m.cik, r.accn); return `<td class="num">${u ? `<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${esc(r.form)}</a>` : '<span class="na">–</span>'}</td>`; }).join('');
    return `<div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Pos <span class="sub">konsep XBRL</span></th>${cols.map(c => `<th class="num">${esc(c.label)}<span class="sub">${esc(c.end)}</span></th>`).join('')}</tr></thead><tbody>
      ${keys.map(k => `<tr><td>${esc(def(k).label)}<span class="sub">${esc((m.c.conceptsUsed[k] || []).join(' | ') || (F.FIELDS[k] ? F.FIELDS[k].concepts[0] + ' (tidak dilaporkan)' : ''))}</span></td>${cols.map(c => `<td class="num">${recLin(m, cellRec(m, k, c, mode), def(k).label + ' ' + c.label, kindOf(k))}</td>`).join('')}</tr>`).join('')}
      <tr><td>Laporan sumber</td>${filingRow}</tr></tbody></table></div>`;
  }
  function statementCsv(m, st, mode) {
    const keys = ROWS[st], cols = columns(m, keys, mode);
    return [['pos', 'konsep XBRL', 'satuan', ...cols.map(c => c.label + ' (' + c.end + ')')],
      ...keys.map(k => [def(k).label, (m.c.conceptsUsed[k] || []).join(' | '), m.c.units[k] || '', ...cols.map(c => { const r = cellRec(m, k, c, mode); return r ? r.value : null; })]),
      ['accession', '', '', ...cols.map(c => { const r = keys.map(k => cellRec(m, k, c, mode)).find(Boolean); return r ? r.accn : null; })]];
  }

  /* ---------- tiap bagian ---------- */
  const latestA = (m, k) => (m.c.annual[k] || [])[0] || null;
  function head(m) {
    const s = m.s || {};
    const fye = /^\d{4}$/.test(s.fiscalYearEnd || '') ? `tahun fiskal berakhir ${s.fiscalYearEnd.slice(2)}/${s.fiscalYearEnd.slice(0, 2)}` : '';
    return `<div class="fa-head"><div class="fa-id"><b>${esc(s.name || m.c.entityName || '–')}</b>
      <span class="meta">CIK <a href="${safeUrl(F.companyUrl(m.cik))}" target="_blank" rel="noopener noreferrer">${esc(m.cik)}</a>${s.sic ? ' · SIC ' + esc(s.sic) + ' ' + esc(s.sicDescription || '') : ''}${fye ? ' · ' + esc(fye) : ''}${s.exchanges && s.exchanges.length ? ' · ' + esc(s.exchanges.join(', ')) : ''}</span></div>
      ${srcLine(m.facts, 'companyfacts XBRL us-gaap')}${m.subs && !m.subs.ok ? `<p class="hint">Daftar laporan (submissions) tidak tersedia: ${esc(m.subs.error || '')}</p>` : ''}</div>`;
  }
  function summary(m, e) {
    if (!m.c.usGaap) return unavailableBox('Laporan us-gaap', { error: `Perusahaan ini tidak melapor dengan taksonomi us-gaap (yang ada: ${m.c.taxonomies.join(', ') || '–'}), mis. pelapor 20-F dengan IFRS. Parser saat ini hanya membaca us-gaap.` });
    const fy = F.annualYears(m.c)[0];
    const R = fy != null ? F.ratiosFor(m.c, fy) : null;
    const kv = [['Pendapatan', 'revenue'], ['Laba bersih', 'netIncome'], ['EPS dilusian', 'epsDiluted'], ['Total aset', 'assets'], ['Ekuitas', 'equity'], ['Arus kas operasi', 'cfo'], ['FCF', 'fcf']]
      .map(([l, k]) => { const r = latestA(m, k); return `<div><dt>${esc(l)}</dt><dd>${recLin(m, r, l + (r ? ' ' + F.periodLabel(r) : ''), kindOf(k))}</dd><small>${esc(r ? F.periodLabel(r) + ' · ' + r.unit : 'Data kurang')}</small></div>`; });
    if (R) for (const k of ['netMargin', 'roe', 'currentRatio']) kv.push(`<div><dt>${esc(R[k].label)}</dt><dd>${calcLin(m, R[k], calcKind(R[k]), R[k].label + ' FY' + fy, true)}</dd><small>FY${esc(fy)} · ${qBadge('calculated')}</small></div>`);
    const P = fy != null ? F.piotroski(m.c, fy) : null;
    const A = fy != null ? F.altman(m.c, fy, { sic: (m.s || {}).sic, sicDescription: (m.s || {}).sicDescription }) : null;
    const per = (m.s && m.s.filings || []).filter(f => f.group === 'periodic').slice(0, 4);
    return `<dl class="kv three">${kv.join('')}</dl>
      <div class="c-cols"><div class="c-sec"><h3>Kualitas keuangan FY${esc(fy ?? '–')} ${qBadge('calculated')}</h3>
        <p class="lead">Piotroski F-score: <b>${esc(P ? P.text : 'Data kurang')}</b>${P && P.missing ? ` · ${P.missing} kriteria Data kurang (tidak dinormalisasi)` : ''}.<br>
        ${A && !A.applicable ? esc(A.reason) : A && A.zpp.score !== null ? `Altman Z'': <b>${esc(fmt(A.zpp.score, 2))}</b> (zona ${esc(A.zpp.zone)}).` : "Altman Z'': Data kurang."}</p>
        <p><button type="button" class="mini-btn" data-fa-sub="quality">Lihat perhitungan di Kualitas</button></p></div>
      <div class="c-sec"><h3>Laporan berkala terbaru</h3>${per.length ? `<ul class="fa-files">${per.map(f => `<li><a href="${safeUrl(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.form)}</a> <span class="meta">periode ${esc(f.reportDate || '–')} · dilaporkan ${esc(f.filed)}</span></li>`).join('')}</ul>` : '<p class="hint">Daftar laporan tidak tersedia.</p>'}</div></div>
      <p class="hint">Angka dari laporan XBRL yang diserahkan perusahaan ke SEC (${qBadge('historical')}), bukan data pasar. Nilai yang dinyatakan ulang (restated) memakai laporan yang terakhir diserahkan. Klik angka untuk konsep XBRL, periode, accession, dan tanggal lapor.</p>`;
  }
  function ratiosView(m) {
    const rows = F.ratios(m.c);
    if (!rows.length) return unavailableBox('Rasio', { error: 'Data kurang: tidak ada data tahunan.' });
    const cols = rows.map(r => ({ label: 'FY' + r.fy, r }));
    return `<div class="fa-tools"><h3>Rasio tahunan ${qBadge('calculated')}</h3><span class="spacer"></span><button type="button" class="mini-btn" data-fa-csv="ratio">CSV</button></div>
      <div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Rasio <span class="sub">rumus</span></th>${cols.map(c => `<th class="num">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
      ${F.RATIO_KEYS.map(k => { const x0 = rows[0].items[k]; return `<tr><td>${esc(x0.label)}<span class="sub">${esc(x0.formula)}</span></td>${cols.map(c => `<td class="num">${calcLin(m, c.r.items[k], calcKind(c.r.items[k]), c.r.items[k].label + ' ' + c.label)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>
      <p class="hint">Neraca memakai posisi akhir tahun fiskal. "–" = Data kurang (arahkan kursor untuk alasannya), misalnya konsep tidak dilaporkan atau pembagi ≤ 0. Utang/ekuitas memakai utang jangka panjang; screener memakai total liabilitas (tertulis di sana).</p>`;
  }
  function growthView(m) {
    const Y = F.growthYoY(m.c), Q = F.growthQoQ(m.c);
    const tbl = (rows, colLbl, keys, csv) => `<div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Pos</th>${rows.map(r => `<th class="num">${esc(colLbl(r))}</th>`).join('')}</tr></thead><tbody>
      ${keys.map(k => `<tr><td>${esc(def(k).label)}</td>${rows.map(r => `<td class="num">${calcLin(m, r.items[k], 'gpct', def(k).label + ' ' + colLbl(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return `<div class="fa-tools"><h3>Pertumbuhan tahunan (YoY) ${qBadge('calculated')}</h3><span class="spacer"></span><button type="button" class="mini-btn" data-fa-csv="growth">CSV</button></div>
      ${Y.length ? tbl(Y, r => 'FY' + r.fy, F.GROWTH_KEYS) : '<p class="hint">Data kurang.</p>'}
      <h3 class="fa-h3">Pertumbuhan antar kuartal (QoQ) ${qBadge('calculated')}</h3>
      ${Q.length ? tbl(Q, r => r.fp + ' FY' + r.fy, ['revenue', 'netIncome', 'epsDiluted']) : '<p class="hint">Data kuartalan kurang.</p>'}
      <p class="hint">Rumus: (nilai periode ÷ nilai periode sebelumnya) − 1. Basis ≤ 0 tidak dihitung (pertumbuhan dari rugi tidak bermakna). QoQ dipengaruhi musim; kuartal turunan (mis. Q4 = setahun − 9 bulan) ditandai Kalkulasi.</p>`;
  }
  async function priceOf(e, ctx) {
    let q = ctx.quote;
    if (!q || !q.price) q = await Quotes.get(e);
    const p = q && q.price ? q.price : datum(null, { reason: 'harga tidak tersedia' });
    return { q, p, obj: { value: p.value, currency: p.currency || e.currency || '', source: p.source, asOf: p.asOf, fetchedAt: p.fetchedAt, quality: p.quality, reason: (q && q.reason) || p.reason } };
  }
  function valuationHtml(m, e, pr, V) {
    const so = (m.c.sharesOutstanding || [])[0];
    const items = Object.entries(V.items).map(([k, x]) => `<div><dt>${esc(F.VALUATION_LABELS[k])}</dt><dd>${calcLin(m, x, k === 'marketCap' ? 'usd' : 'x', F.VALUATION_LABELS[k] + ' ' + (e.symbol || ''), true)}</dd><small>${esc(x.formula ? x.formula.split('.')[0] : '')}</small></div>`).join('');
    return `<dl class="kv three"><div><dt>Harga</dt><dd>${datumHtml(pr.p, { dp: 2, label: (e.symbol || '') + ' harga' })}</dd><small>${esc(pr.p.source || pr.obj.reason || '')} ${datumAge(pr.p)}</small></div>
      <div><dt>Saham beredar</dt><dd>${recLin(m, so, 'Saham beredar (sampul laporan)', 'sh')}</dd><small>${esc(so ? 'per ' + so.end + ' · ' + so.form : 'dei:EntityCommonStockSharesOutstanding tidak dilaporkan')}</small></div>${items}</dl>
      ${V.block ? `<div class="na-box"><div>${qBadge('unavailable')} <strong>Valuasi</strong></div><p>${esc(V.block)}</p></div>` : ''}
      <p class="hint">Valuasi hanya dihitung dengan harga nyata (${esc(pr.p.source || 'sumber harga')}, kualitas ${esc((QUALITY[pr.p.quality] || [pr.p.quality])[0])}) dan angka laporan SEC FY${esc(V.fy ?? '–')}. Harga dan laporan berasal dari waktu berbeda; P/E memakai EPS tahun fiskal terakhir (bukan TTM). Bukan rekomendasi.</p>`;
  }
  async function valuationView(m, e, ctx) {
    const pr = await priceOf(e, ctx);
    if (!ctx.alive()) return null;
    return `<h3 class="fa-h3">Valuasi ${qBadge('calculated')}</h3>` + valuationHtml(m, e, pr, F.valuation(m.c, pr.obj));
  }
  /* Piotroski + Altman dengan "Lihat perhitungan" per kriteria/komponen */
  async function qualityView(m, e, ctx) {
    const years = F.annualYears(m.c, ['netIncome', 'revenue', 'assets']).slice(0, 8);
    if (!years.length) return unavailableBox('Kualitas', { error: 'Data kurang: tidak ada data tahunan.' });
    if (!years.includes(S.fy)) S.fy = years[0];
    const fy = S.fy;
    const pr = await priceOf(e, ctx);
    if (!ctx.alive()) return null;
    const V = F.valuation(m.c, pr.obj);
    const mc = V.items.marketCap && V.items.marketCap.value !== null ? { value: V.items.marketCap.value, period: 'harga ' + (pr.p.asOf || pr.p.fetchedAt || ''), concept: 'Harga × saham beredar', rec: { value: V.items.marketCap.value, unit: 'USD', quality: 'calculated', formula: V.items.marketCap.formula } } : null;
    const P = F.piotroski(m.c, fy);
    const A = F.altman(m.c, fy, { sic: (m.s || {}).sic, sicDescription: (m.s || {}).sicDescription, marketCap: fy === years[0] ? mc : null });
    const pill = p => (p === true ? '<span class="tpill fa-ok">Lolos</span>' : p === false ? '<span class="tpill fa-no">Tidak lolos</span>' : '<span class="tpill fa-dk">Data kurang</span>');
    const pioRows = P.criteria.map(c => `<tr><td>${esc(c.group)}</td><td><b>${esc(c.id)}</b> ${esc(c.label)}</td><td>${pill(c.pass)}</td><td>${calcBtn('pio-' + c.id)}</td></tr>
      <tr class="fa-calc" id="faCalc-pio-${esc(c.id)}" hidden><td colspan="4"><p><b>Rumus:</b> ${esc(c.formula)}</p>${c.reason ? `<p class="fa-dk">${esc(c.reason)}</p>` : `<p><b>Hasil:</b> ${esc(full(c.value, Math.abs(c.value) < 10 ? 'z' : 'usd'))} → ${c.pass ? 'lolos' : 'tidak lolos'}</p>`}${inputsHtml(m, c)}<p class="meta">Sumber: SEC EDGAR companyfacts (CIK ${esc(m.cik)})</p></td></tr>`).join('');
    const zTable = (z, key) => {
      if (!z) return '';
      const comp = z.components.map(c => `<tr><td><b>${esc(c.id)}</b> ${esc(c.label)}</td><td class="num">${calcLin(m, c, 'z', c.id + ' ' + z.name)}</td><td class="num">${esc(fmt(c.weight, 2))}</td><td class="num">${c.contribution === null ? '<span class="na fa-dk">Data kurang</span>' : esc(fmt(c.contribution, 3))}</td><td>${calcBtn(key + '-' + c.id)}</td></tr>
        <tr class="fa-calc" id="faCalc-${esc(key + '-' + c.id)}" hidden><td colspan="5"><p><b>Rumus:</b> ${esc(c.formula)}</p>${c.reason ? `<p class="fa-dk">${esc(c.reason)}</p>` : ''}${inputsHtml(m, c)}<p class="meta">Periode: FY${esc(A.fy)} · Sumber: SEC EDGAR companyfacts</p></td></tr>`).join('');
      const score = z.score === null ? `<span class="na fa-dk" title="${esc(z.reason || '')}">Data kurang</span>` : `<b>${esc(fmt(z.score, 3))}</b> <span class="tpill fa-z-${esc(z.zone)}">zona ${esc(z.zone)}</span>`;
      return `<h3 class="fa-h3">${esc(z.name)} FY${esc(A.fy)} ${qBadge('calculated')}</h3>
        <div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Komponen</th><th class="num">Nilai</th><th class="num">Bobot</th><th class="num">Kontribusi</th><th></th></tr></thead><tbody>${comp}
        <tr><td><b>Skor</b></td><td colspan="4">${score}</td></tr></tbody></table></div>
        <p class="hint">${esc(z.formula)} Ambang: aman &gt; ${esc(fmt(z.thresholds.safe, 2))}, tekanan &lt; ${esc(fmt(z.thresholds.distress, 2))}. ${esc(z.score === null ? (z.reason || '') : z.interpretation)}</p>`;
    };
    return `<div class="fa-tools"><label class="meta" for="faFy">Tahun fiskal</label><select id="faFy" data-fa-fy>${years.map(y => `<option value="${y}"${y === fy ? ' selected' : ''}>FY${y}</option>`).join('')}</select>
        <span class="spacer"></span><button type="button" class="mini-btn" data-fa-calc-all>Buka semua perhitungan</button></div>
      <h3 class="fa-h3">Piotroski F-score FY${esc(fy)} ${qBadge('calculated')}</h3>
      <p class="fa-score"><b>${esc(P.text)}</b>${P.missing ? ` · ${esc(P.missing)} kriteria Data kurang: skor TIDAK dinormalisasi ke 9` : ''}</p>
      <div class="table-wrap fa-wrap"><table class="dense static fa-tbl fa-pio"><thead><tr><th>Kelompok</th><th>Kriteria</th><th>Hasil</th><th></th></tr></thead><tbody>${pioRows}</tbody></table></div>
      ${(m.s && F.isFinancialSic(m.s.sic)) ? '<p class="hint">Catatan: Piotroski dirancang untuk perusahaan non-keuangan; untuk bank hasilnya kurang bermakna.</p>' : ''}
      ${A.applicable ? zTable(A.zpp, 'zpp') + (A.z ? zTable(A.z, 'z') : `<p class="hint">Altman Z asli (1968): ${esc(fy === years[0] ? A.zReason : 'hanya dihitung untuk tahun fiskal terbaru (memakai harga terkini).')}</p>`)
        : `<div class="na-box"><div>${qBadge('unavailable')} <strong>Altman Z-score</strong></div><p>${esc(A.reason)}</p></div>`}
      <p class="disclaimer">Skor model statistik dari laporan tahunan, dihitung otomatis. Bukan rekomendasi dan bukan prediksi pasti. Kriteria yang inputnya tidak dilaporkan ditulis "Data kurang" dan tidak dihitung; tidak ada nilai yang ditebak.</p>`;
  }
  async function earningsView(m, e, ctx) {
    const a = (m.c.annual.epsDiluted || []).slice(0, 8), q = (m.c.quarterly.epsDiluted || []).slice(0, 8);
    const rows = list => list.map(r => `<tr><td>${esc(F.periodLabel(r))}<span class="sub">${esc(r.start ? r.start + ' s/d ' + r.end : r.end)}</span></td><td class="num">${recLin(m, r, 'EPS dilusian ' + F.periodLabel(r), 'eps')}</td><td class="num">${recLin(m, (m.c[r.fp === 'FY' ? 'annual' : 'quarterly'].netIncome || []).find(x => x.fy === r.fy && x.fp === r.fp), 'Laba bersih ' + F.periodLabel(r), 'usd')}</td><td>${esc(r.form)}</td><td>${esc(r.filed)}</td></tr>`).join('');
    const tbl = (title, list) => `<h3 class="fa-h3">${title}</h3>${list.length ? `<div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Periode</th><th class="num">EPS dilusian</th><th class="num">Laba bersih</th><th>Form</th><th>Dilaporkan</th></tr></thead><tbody>${rows(list)}</tbody></table></div>` : '<p class="hint">Data kurang: EPS dilusian tidak dilaporkan.</p>'}`;
    let est = '';
    const fh = Net.server && Net.server.health.keys && Net.server.health.keys.finnhub;
    if (fh) {
      const sym = e.providers.finnhub;
      const r = await getData('finnhub', { server: `/api/finnhub?kind=earnings&symbol=${encodeURIComponent(sym)}`, ttl: 3 * 3600e3, persist: true, key: 'fh:earnings:' + sym });
      if (!ctx.alive()) return null;
      const L = (v, lbl, kind) => (Number.isFinite(v) ? Lineage.wrap({ label: lbl, value: fmt(v, kind === 'p' ? 1 : 2), unit: kind === 'p' ? '%' : 'USD', quality: r.stale ? 'stale' : 'delayed', source: 'Finnhub /stock/earnings (estimasi pihak ketiga)', home: 'https://finnhub.io/docs/api/company-earnings', url: r.sourceUrl, fetchedAt: r.fetchedAt, via: r.via }, esc(fmt(v, kind === 'p' ? 1 : 2) + (kind === 'p' ? '%' : ''))) : '<span class="na">–</span>');
      est = r.ok && Array.isArray(r.data) && r.data.length
        ? `<h3 class="fa-h3">Estimasi analis vs aktual (Finnhub) ${qBadge(r.stale ? 'stale' : 'delayed')}</h3><div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Kuartal</th><th class="num">EPS aktual</th><th class="num">Estimasi</th><th class="num">Kejutan</th></tr></thead><tbody>
          ${r.data.slice(0, 8).map(x => `<tr><td>${esc(x.period || '')}</td><td class="num">${L(x.actual, 'EPS aktual ' + x.period)}</td><td class="num">${L(x.estimate, 'Estimasi EPS ' + x.period)}</td><td class="num">${L(x.surprisePct, 'Kejutan % ' + x.period, 'p')}</td></tr>`).join('')}</tbody></table></div>
          <p class="hint">Estimasi = konsensus analis dari Finnhub (pihak ketiga), BUKAN angka SEC. ${srcLine(r)}</p>`
        : unavailableBox('Estimasi analis (Finnhub)', r);
    } else est = '<p class="hint">Estimasi analis tidak ditampilkan: SEC tidak menerbitkan estimasi, dan sumber estimasi gratis (Finnhub) butuh <code>FINNHUB_API_KEY</code> di .env server.</p>';
    return tbl(`EPS tahunan (SEC) ${qBadge('historical')}`, a) + tbl(`EPS kuartalan (SEC) ${qBadge('historical')}`, q) + est;
  }
  function dividendView(m) {
    const A = F.indexAnnual(m.c);
    const years = F.annualYears(m.c, ['dps', 'dividendsPaid']).slice(0, 10);
    if (!years.length) return `<div class="na-box"><div>${qBadge('unavailable')} <strong>Dividen</strong></div><p>Tidak ada data dividen di laporan XBRL (CommonStockDividendsPerShareDeclared, PaymentsOfDividends). Bisa berarti perusahaan tidak membagikan dividen, atau memakai konsep XBRL lain. Tidak ditulis 0 karena tidak dilaporkan.</p></div>`;
    const payout = fy => { const d = A.dividendsPaid.get(fy) || null, n = A.netIncome.get(fy) || null; return { label: 'Payout', formula: 'Dividen tunai dibayar ÷ Laba bersih', pct: true, value: d && n && n.value > 0 ? d.value / n.value : null, reason: !d || !n ? 'Data kurang: dividen dibayar atau laba bersih tidak dilaporkan' : 'Laba bersih ≤ 0: payout tidak bermakna', inputs: [{ name: 'Dividen dibayar', value: d ? d.value : null, period: 'FY' + fy, concept: d ? d.concept : 'PaymentsOfDividends', rec: d }, { name: 'Laba bersih', value: n ? n.value : null, period: 'FY' + fy, concept: 'NetIncomeLoss', rec: n }] }; };
    const q = (m.c.quarterly.dps || []).slice(0, 8);
    return `<div class="fa-tools"><h3>Dividen tahunan ${qBadge('historical')}</h3><span class="spacer"></span><button type="button" class="mini-btn" data-fa-csv="div">CSV</button></div>
      <div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Pos</th>${years.map(y => `<th class="num">FY${esc(y)}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Dividen per saham (diumumkan)<span class="sub">CommonStockDividendsPerShareDeclared</span></td>${years.map(y => `<td class="num">${recLin(m, A.dps.get(y) || null, 'Dividen per saham FY' + y, 'eps')}</td>`).join('')}</tr>
      <tr><td>Dividen tunai dibayar<span class="sub">${esc((m.c.conceptsUsed.dividendsPaid || ['PaymentsOfDividends']).join(' | '))}</span></td>${years.map(y => `<td class="num">${recLin(m, A.dividendsPaid.get(y) || null, 'Dividen dibayar FY' + y, 'usd')}</td>`).join('')}</tr>
      <tr><td>Payout ${qBadge('calculated')}<span class="sub">dividen dibayar ÷ laba bersih</span></td>${years.map(y => `<td class="num">${calcLin(m, payout(y), 'pct', 'Payout FY' + y)}</td>`).join('')}</tr></tbody></table></div>
      ${q.length ? `<h3 class="fa-h3">Dividen per saham kuartalan</h3><div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr>${q.map(r => `<th class="num">${esc(F.periodLabel(r))}</th>`).join('')}</tr></thead><tbody><tr>${q.map(r => `<td class="num">${recLin(m, r, 'Dividen per saham ' + F.periodLabel(r), 'eps')}</td>`).join('')}</tr></tbody></table></div>` : ''}
      <p class="hint">Dividend yield butuh harga; lihat Valuasi. Tanggal ex-dividen dan pembayaran tidak ada di XBRL companyfacts.</p>`;
  }
  function ownershipView(m) {
    const own = (m.s && m.s.filings || []).filter(f => f.group === 'own');
    return unavailableBox('Kepemilikan institusi (13F)', { error: 'Belum tersedia. Laporan 13F diserahkan per manajer investasi, bukan per perusahaan; SEC tidak menyediakan API gratis "siapa saja pemegang saham perusahaan X". Menyusunnya berarti mengunduh dan menggabungkan ribuan 13F-HR tiap kuartal. Penyedia yang sudah menggabungkannya berbayar.' })
      + `<h3 class="fa-h3">Laporan kepemilikan &gt; 5% (Schedule 13D/13G) di EDGAR perusahaan ini ${qBadge('historical')}</h3>`
      + (own.length ? `<div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Form</th><th>Dilaporkan</th><th>Dokumen</th></tr></thead><tbody>${own.map(f => `<tr><td>${esc(f.form)}</td><td>${esc(f.filed)}</td><td><a href="${safeUrl(f.url)}" target="_blank" rel="noopener noreferrer">buka</a> · <a href="${safeUrl(f.indexUrl)}" target="_blank" rel="noopener noreferrer">indeks</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Tidak ada Schedule 13D/13G di daftar laporan terbaru (submissions).</p>')
      + '<p class="hint">13D/13G wajib bila kepemilikan melewati 5%; isi (nama pemegang, persentase) ada di dokumennya. Laporan ini terlambat beberapa hari sampai minggu.</p>';
  }
  async function insiderView(m, e, ctx) {
    const f4 = (m.s && m.s.filings || []).filter(f => f.group === 'form4');
    let html = `<h3 class="fa-h3">Form 4 (transaksi orang dalam) dari EDGAR ${qBadge('historical')}</h3>`
      + (f4.length ? `<div class="table-wrap fa-wrap"><table class="dense static fa-tbl"><thead><tr><th>Dilaporkan</th><th>Tanggal transaksi</th><th>Form</th><th>Dokumen</th></tr></thead><tbody>${f4.map(f => `<tr><td>${esc(f.filed)}</td><td>${esc(f.reportDate || '–')}</td><td>${esc(f.form)}</td><td><a href="${safeUrl(f.url)}" target="_blank" rel="noopener noreferrer">buka</a> · <a href="${safeUrl(f.indexUrl)}" target="_blank" rel="noopener noreferrer">indeks</a></td></tr>`).join('')}</tbody></table></div>`
        : m.s ? '<p class="hint">Tidak ada Form 4 di daftar laporan terbaru.</p>' : unavailableBox('Daftar Form 4', m.subs || {}))
      + '<p class="hint">Form 4 wajib diserahkan maksimal 2 hari kerja setelah transaksi. Daftar ini dari indeks EDGAR (submissions); jumlah dan harga transaksi ada di dokumennya.</p>';
    const fh = Net.server && Net.server.health.keys && Net.server.health.keys.finnhub;
    if (!fh) return html + '<p class="hint">Tabel transaksi terurai (jumlah, harga) butuh <code>FINNHUB_API_KEY</code> di .env server.</p>';
    html += `<h3 class="fa-h3">Transaksi terurai (Finnhub, dari Form 4)</h3><div class="fa-fh"></div>`;
    return { html, after: async box => { const t = box.querySelector('.fa-fh'); if (t) await AssetPanel.renderPart('insider', instLike(e), t, ctx.alive); } };
  }

  /* ---------- kerangka FA + sub-tab ---------- */
  async function drawBody() {
    const cur = S.cur; if (!cur) return;
    const my = ++S.seq;
    const box = cur.el.querySelector('.fa-body'); if (!box) return;
    const { m, e, ctx } = cur;
    const sub = cur.only || S.sub;
    const alive = () => my === S.seq && ctx.alive() && box.isConnected;
    if (!cur.only) cur.el.querySelectorAll('[data-fa-sub][role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.faSub === sub)));
    const sync = { sum: () => summary(m, e), ratio: () => ratiosView(m), growth: () => growthView(m), div: () => dividendView(m), own: () => ownershipView(m) };
    let out;
    if (ROWS[sub]) {
      out = `<div class="fa-tools"><h3>${esc(TITLE[sub])} ${qBadge('historical')}</h3><div class="seg" role="group" aria-label="Periode"><button type="button" data-fa-mode="a" aria-pressed="${S.mode === 'a'}">Tahunan</button><button type="button" data-fa-mode="q" aria-pressed="${S.mode === 'q'}">Kuartalan</button></div>
        <span class="spacer"></span><button type="button" class="mini-btn" data-fa-csv="${sub}">CSV</button></div>${statement(m, sub, S.mode)}
        <p class="hint">${S.mode === 'q' ? 'Kuartal dari 10-Q; Q4 dan arus kas Q2/Q3 sering dihitung dari angka setahun/YTD (ditandai Kalkulasi, rumus di asal-usulnya). EPS dan jumlah saham tidak bisa dijumlah, jadi Q4-nya tidak dihitung.' : 'Tahun fiskal perusahaan (belum tentu sama dengan tahun kalender). Nilai dinyatakan ulang memakai laporan yang terakhir diserahkan.'}</p>`;
    } else if (sync[sub]) out = sync[sub]();
    else {
      if (!box.querySelector(':scope > .loading')) box.innerHTML = '<p class="loading">Memuat</p>';
      const fn = { val: valuationView, quality: qualityView, earn: earningsView, ins: insiderView }[sub] || (() => summary(m, e));
      out = await fn(m, e, { ...ctx, alive, get quote() { return ctx.quote; } });
      if (!alive() || out === null) return;
    }
    if (out && typeof out === 'object') { box.innerHTML = out.html; await out.after(box); return; }
    box.innerHTML = out;
  }
  /* entitas -> data -> kerangka. only = bagian tunggal (tab EST/DIV/OWN/INSIDER) */
  async function render(e, el, ctx, only) {
    const what = only ? (SUBS.find(s => s[0] === only) || [0, 'Fundamental'])[1] : 'Fundamental';
    el.innerHTML = '<p class="loading">Mengambil laporan SEC EDGAR</p>';
    const m = await FundData.load(e, ctx.alive);
    if (!ctx.alive() || m.kind === 'cancel') return;
    if (!m.ok) { el.innerHTML = FundData.failBox(e, what, m); return; }
    S.cur = { e, el, ctx, m, only: only || null };
    el.innerHTML = head(m) + (only ? '' : `<div class="tabs fa-tabs" role="tablist" aria-label="Bagian fundamental">${SUBS.map(([k, l]) => `<button type="button" role="tab" data-fa-sub="${k}" aria-selected="${k === S.sub}">${esc(l)}</button>`).join('')}</div>`) + '<div class="fa-body"></div>';
    await drawBody();
  }
  function csvFor(kind) {
    const { m, e } = S.cur;
    if (ROWS[kind]) return statementCsv(m, kind, S.mode);
    if (kind === 'ratio') { const R = F.ratios(m.c); return [['rasio', 'rumus', ...R.map(r => 'FY' + r.fy)], ...F.RATIO_KEYS.map(k => [R[0].items[k].label, R[0].items[k].formula, ...R.map(r => r.items[k].value)])]; }
    if (kind === 'growth') { const Y = F.growthYoY(m.c); return [['pos (pertumbuhan YoY)', ...Y.map(r => 'FY' + r.fy)], ...F.GROWTH_KEYS.map(k => [def(k).label, ...Y.map(r => r.items[k].value)])]; }
    if (kind === 'div') { const A = F.indexAnnual(m.c), ys = F.annualYears(m.c, ['dps', 'dividendsPaid']); return [['pos', ...ys.map(y => 'FY' + y)], ['dividen per saham', ...ys.map(y => (A.dps.get(y) || {}).value ?? null)], ['dividen dibayar', ...ys.map(y => (A.dividendsPaid.get(y) || {}).value ?? null)]]; }
    void e;
    return [];
  }
  document.addEventListener('click', ev => {
    const cur = S.cur;
    if (!cur || !cur.el.isConnected) return;
    const t = ev.target.closest('[data-fa-sub], [data-fa-mode], [data-fa-csv], [data-fa-calc], [data-fa-calc-all]');
    if (!t || !cur.el.contains(t)) return;
    if (t.dataset.faSub) { S.sub = t.dataset.faSub; Store.set('faSub', S.sub); if (cur.only) return; drawBody(); return; }
    if (t.dataset.faMode) { S.mode = t.dataset.faMode === 'q' ? 'q' : 'a'; Store.set('faMode', S.mode); drawBody(); return; }
    if (t.dataset.faCsv) { download(`${(cur.e.symbol || 'saham').replace(/[^\w.-]/g, '')}-${t.dataset.faCsv}-sec.csv`, toCsv(csvFor(t.dataset.faCsv)), 'text/csv'); return; }
    if (t.hasAttribute('data-fa-calc-all')) {
      const rows = [...cur.el.querySelectorAll('tr.fa-calc')], open = rows.some(r => r.hidden);
      rows.forEach(r => { r.hidden = !open; });
      cur.el.querySelectorAll('[data-fa-calc]').forEach(b => b.setAttribute('aria-expanded', String(open)));
      t.textContent = open ? 'Tutup semua perhitungan' : 'Buka semua perhitungan';
      return;
    }
    const row = cur.el.querySelector('#faCalc-' + CSS.escape(t.dataset.faCalc));
    if (row) { row.hidden = !row.hidden; t.setAttribute('aria-expanded', String(!row.hidden)); t.textContent = row.hidden ? 'Lihat perhitungan' : 'Tutup perhitungan'; }
  });
  document.addEventListener('change', ev => {
    const s = ev.target.closest('[data-fa-fy]');
    if (!s || !S.cur || !S.cur.el.contains(s)) return;
    S.fy = +s.value; drawBody();
  });
  return { render };
})();

/* ---------------- tab detail aset (mengganti tab Finnhub lama) ---------------- */
SecurityTabs.register({ id: 'fa', label: 'Fundamental', verb: 'FA', types: ['stock'], order: 20, render: (e, el, ctx) => FundView.render(e, el, ctx) });
SecurityTabs.register({ id: 'est', label: 'Earnings', verb: 'EST', types: ['stock'], order: 35, render: (e, el, ctx) => FundView.render(e, el, ctx, 'earn') });
SecurityTabs.register({ id: 'insider', label: 'Insider', verb: 'INSIDER', types: ['stock'], order: 40, render: (e, el, ctx) => FundView.render(e, el, ctx, 'ins') });
SecurityTabs.register({ id: 'div', label: 'Dividen', verb: 'DIV', types: ['stock', 'etf'], order: 42, render: (e, el, ctx) => FundView.render(e, el, ctx, 'div') });
SecurityTabs.register({ id: 'own', label: 'Kepemilikan', verb: 'OWN', types: ['stock', 'etf'], order: 44, render: (e, el, ctx) => FundView.render(e, el, ctx, 'own') });
