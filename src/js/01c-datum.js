/* =====================================================================
   DATUM: satu angka + asal-usulnya
   Bentuk: { value, asOf, fetchedAt, source, provider, quality, stale, currency, unit,
             period, url, home, via, formula, note, reason }
   - value null = tidak tersedia (BUKAN 0). reason menjelaskan kenapa.
   - Tampilan memakai datumHtml(): angka bisa diklik untuk melihat sumber, endpoint,
     waktu ambil, waktu data, periode, kualitas, dan rumus. Tidak pernah "NaN"/"undefined".
   ===================================================================== */
function datum(value, meta = {}) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    value: v, asOf: meta.asOf || null, fetchedAt: meta.fetchedAt || null, source: meta.source || '', provider: meta.provider || '',
    quality: v === null ? 'unavailable' : (meta.stale ? 'stale' : meta.quality || 'delayed'), stale: !!meta.stale,
    currency: meta.currency || '', unit: meta.unit || '', period: meta.period || '', url: meta.url || '', home: meta.home || '',
    via: meta.via || '', formula: meta.formula || '', note: meta.note || '', reason: v === null ? (meta.reason || 'Sumber tidak tersedia') : '',
  };
}
/* datum dari hasil getData() */
function datumFrom(r, value, meta = {}) {
  if (!r || !r.ok) return datum(null, { reason: (r && r.error) || 'Sumber tidak tersedia', source: r && r.source, provider: r && r.provider });
  return datum(value, {
    source: r.source, provider: r.provider, fetchedAt: r.fetchedAt, stale: r.stale, quality: r.quality, url: r.sourceUrl, via: r.via,
    home: (SOURCE_DEFS[r.provider] || {}).home, ...meta,
  });
}
/* tampilkan sebuah datum. opts: { dp, compact, pct, label, plain } */
function datumHtml(d, opts = {}) {
  if (!d || d.value === null) return `<span class="na" title="${esc('Tidak tersedia: ' + ((d && d.reason) || 'tanpa sumber'))}">–</span>`;
  const txt = opts.pct ? fmtPct(d.value / 100, opts.dp ?? 2) : opts.compact ? fmtCompact(d.value) : fmt(d.value, opts.dp ?? 2);
  if (opts.plain) return esc(txt);
  return Lineage.wrap({
    label: opts.label || d.label || '', value: txt, unit: d.unit, currency: d.currency, quality: d.quality, source: d.source,
    home: d.home, url: d.url, asOf: d.asOf, fetchedAt: d.fetchedAt, via: d.via, period: d.period, formula: d.formula, note: d.note,
  }, esc(txt));
}
/* umur data selalu terlihat: "5 dtk lalu" + lencana kualitas */
function datumAge(d) {
  if (!d || d.value === null) return qBadge('unavailable', d && d.reason);
  const t = d.asOf || d.fetchedAt;
  return qBadge(d.quality, d.source) + (t ? `<span class="meta" title="${esc('Waktu data: ' + (d.asOf || '–') + ' · diambil: ' + (d.fetchedAt || '–'))}">${esc(fmtAge(t))}</span>` : '');
}
