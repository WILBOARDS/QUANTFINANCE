/* =====================================================================
   NEGARA: tab "Pasar" (bursa utama, indeks, mata uang, obligasi 10 tahun, perusahaan tercatat
   di katalog, riwayat makro 10-20 tahun, risiko politik WGI)
   - Harga lewat Quotes.get (Datum: sumber, waktu, kualitas); riwayat makro dari data IMF WEO /
     World Bank yang sudah dimuat CountryData (proyeksi IMF ditandai).
   - Daftar perusahaan = data referensi katalog aplikasi (bukan daftar lengkap bursa).
   ===================================================================== */
const CountryMarket = (() => {
  const MKEY = { GB: 'UK' };
  const THIS = new Date().getUTCFullYear();
  function spark(name, pts, unit, src) {
    const p = pts.filter(x => Number.isFinite(x.y));
    if (p.length < 3) return `<div class="cx-ch"><h4>${esc(name)}</h4><p class="hint">Data kurang (${p.length} titik).</p></div>`;
    const W = 300, H = 70, xs = p.map(x => x.x), ys = p.map(x => x.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys), k = y1 > y0 ? y1 - y0 : 1;
    const X = x => 4 + (x - x0) / Math.max(1, x1 - x0) * (W - 8), Y = y => H - 6 - (y - y0) / k * (H - 12);
    const hist = p.filter(x => !x.proj), proj = p.filter((x, i) => x.proj || (p[i + 1] && p[i + 1].proj));
    const path = a => a.map((q, i) => (i ? 'L' : 'M') + X(q.x).toFixed(1) + ' ' + Y(q.y).toFixed(1)).join(' ');
    const lastH = hist[hist.length - 1] || p[p.length - 1];
    return `<div class="cx-ch"><h4>${esc(name)} · terakhir ${esc(fmt(lastH.y, 1))}${esc(unit)} (${esc(lastH.x)})</h4>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)} ${esc(x0)}–${esc(x1)}, terakhir ${esc(fmt(lastH.y, 1))}${esc(unit)} tahun ${esc(lastH.x)}">
        ${y0 < 0 ? `<line x1="4" x2="${W - 4}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="rgba(147,168,191,0.35)" stroke-dasharray="3 3"/>` : ''}
        <path d="${path(hist)}" fill="none" stroke="#e0b15a" stroke-width="1.6"/>${proj.length > 1 ? `<path d="${path(proj)}" fill="none" stroke="#e0b15a" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.7"/>` : ''}
      </svg><p class="meta">${esc(src)} · ${esc(x0)}–${esc(x1)}${proj.length > 1 ? ' · garis putus = proyeksi IMF' : ''}</p></div>`;
  }
  async function quoteCell(e, label) {
    const q = await Quotes.get(e).catch(err => ({ price: datum(null, { reason: err.message }) }));
    const p = q.price || datum(null, { reason: q.reason });
    const chg = q.changePct && q.changePct.value !== null ? `<span class="${sign(q.changePct.value)}">${esc(fmtPct(q.changePct.value / 100, 2))}</span>` : '';
    return `<div><dt>${esc(label)} <button type="button" class="link-btn" data-cm-open="${esc(e.id)}">${esc(e.symbol)}</button></dt><dd>${datumHtml(p, { dp: priceDp(e, p.value), label: e.symbol })} ${chg}</dd><small>${datumAge(p)}</small></div>`;
  }
  async function render(c, el, alive) {
    const iso2 = c.iso2, mk = MARKETS[MKEY[iso2] || iso2];
    const idx = REG.all().filter(e => e.type === 'index' && e.country === iso2).slice(0, 3);
    const fx = c.cur && c.cur !== 'USD' ? (REG.get('fx:USD' + c.cur) || REG.get('fx:' + c.cur + 'USD')) : null;
    const cos = REG.all().filter(e => e.type === 'stock' && e.country === iso2).sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const ser = key => { const x = CountryData.get(c.iso3, key); return x && x.series ? x.series.filter(([y]) => y >= THIS - 20).map(([y, v]) => ({ x: y, y: v, proj: y >= THIS })) : []; };
    const srcOf = key => { const x = CountryData.get(c.iso3, key); return x ? x.src + (x.code ? ' ' + x.code : '') : 'tidak tersedia'; };
    const ps = CountryData.get(c.iso3, 'polstab');
    el.innerHTML = `<div class="c-body cx-mkt">
      <div class="c-sec"><h3>Bursa dan harga</h3>
        <p class="lead">${mk ? `Bursa utama: <b>${esc(mk.ex)}</b> (${esc(mk.city)}), zona waktu ${esc(mk.tz)}.` : 'Bursa utama: tidak ada di daftar bursa aplikasi ini.'}</p>
        <dl class="kv three" id="cmQuotes"><div><dt>Memuat</dt><dd><span class="loading sm">harga</span></dd></div></dl></div>
      <div class="c-sec"><h3>Perusahaan tercatat di katalog aplikasi (${cos.length})</h3>
        ${cos.length ? `<div class="cx-cos">${cos.map(e => `<button type="button" class="mini-btn" data-cm-open="${esc(e.id)}" title="${esc(e.name)}">${esc(e.symbol)}</button>`).join('')}</div><p class="hint">Daftar referensi aplikasi (bukan seluruh emiten bursa). Klik untuk detail aset.</p>` : '<p class="hint">Belum ada saham negara ini di katalog aplikasi.</p>'}</div>
      <div class="c-sec"><h3>Riwayat makro (hingga 20 tahun) ${qBadge('historical')}</h3>
        <div class="cx-charts">${spark('Pertumbuhan PDB riil', ser('growth'), '%', srcOf('growth'))}${spark('Inflasi', ser('infl'), '%', srcOf('infl'))}${spark('Pengangguran', ser('unemp'), '%', srcOf('unemp'))}${spark('Utang pemerintah', ser('debt'), '% PDB', srcOf('debt'))}</div></div>
      <div class="c-sec"><h3>Risiko politik ${qBadge(ps ? ps.quality || 'historical' : 'unavailable')}</h3>
        <p class="lead">${ps ? `Stabilitas politik dan ketiadaan kekerasan/terorisme (WGI): ${Lineage.wrap({ label: 'WGI Political Stability ' + c.name, value: fmt(ps.value, 2), quality: ps.quality || 'historical', source: ps.src + ' ' + (ps.code || 'PV.EST'), home: 'https://www.worldbank.org/en/publication/worldwide-governance-indicators', asOf: String(ps.year), note: 'Skala kira-kira −2,5 (lemah) sampai +2,5 (kuat); estimasi persepsi, bukan ramalan.' }, esc(fmt(ps.value, 2)))} (tahun ${esc(ps.year)}).` : 'Data WGI belum dimuat atau tidak tersedia untuk negara ini.'}</p>
        <p class="hint">Definisi: Worldwide Governance Indicators (Bank Dunia) mengukur persepsi kemungkinan ketidakstabilan politik atau kekerasan bermotif politik, termasuk terorisme. Skor gabungan survei, tertinggal 1–2 tahun, bukan prediksi kejadian.</p></div>
    </div>`;
    const cells = [];
    for (const e of idx) cells.push(quoteCell(e, 'Indeks'));
    if (fx) cells.push(quoteCell(fx, 'Mata uang'));
    const b = CountryData.bond10y(iso2).then(r => {
      if (!r || !r.ok || !r.series || !r.series.length) return `<div><dt>Obligasi 10 tahun</dt><dd class="na" title="${esc((r && r.error) || 'tidak ada seri OECD untuk negara ini')}">tidak tersedia</dd><small>${qBadge('unavailable')}</small></div>`;
      const last = r.series[r.series.length - 1];
      return `<div><dt>Obligasi 10 tahun</dt><dd>${Lineage.wrap({ label: 'Imbal hasil 10 tahun ' + c.name, value: fmt(last.value, 2) + '%', quality: r.stale ? 'stale' : 'historical', source: 'OECD via FRED ' + r.id, home: 'https://fred.stlouisfed.org/series/' + r.id, asOf: last.date, period: 'bulanan (rata-rata bulan)', fetchedAt: r.fetchedAt }, esc(fmt(last.value, 2) + '%'))}</dd><small>${qBadge(r.stale ? 'stale' : 'historical')} ${esc(last.date.slice(0, 7))}</small></div>`;
    }).catch(err => `<div><dt>Obligasi 10 tahun</dt><dd class="na" title="${esc(err.message)}">tidak tersedia</dd></div>`);
    cells.push(b);
    const html = await Promise.all(cells);
    if (!alive() || !el.isConnected) return;
    const box = el.querySelector('#cmQuotes');
    if (box) box.innerHTML = html.join('') || '<div><dt>Harga</dt><dd class="na">tidak ada indeks/mata uang negara ini di katalog</dd></div>';
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-cm-open]');
    if (!b) return;
    const e = REG.get(b.dataset.cmOpen);
    if (e) { SecurityPage.open(e, 'overview'); App.showPage('security'); }
  });
  return { render };
})();
