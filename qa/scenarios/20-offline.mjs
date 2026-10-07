/* Mode C: tanpa jaringan sama sekali: semua panel harus menulis "tidak tersedia", tanpa error JS. */
export default async function (h) {
  const { wait, shot, go } = h;
  await h.scenario('C1 offline: semua halaman tanpa error JS', async (p, { base }) => {
    await p.goto(base); await wait(2000);
    for (const pg of ['intel', 'country', 'news', 'ships', 'macro', 'cash', 'sources', 'about', 'market']) { await go(p, pg); await wait(900); }
    await go(p, 'ships'); await wait(800);
    const t = await p.textContent('#vesselWrap');
    if (!/tidak tersedia/i.test(t)) throw new Error('Halaman kapal tidak menulis "tidak tersedia" saat offline');
    await shot(p, 'C1-offline-kapal');
    await go(p, 'news'); await wait(1500);
    await shot(p, 'C1-offline-berita');
  }, { mode: 'offline' });
}
