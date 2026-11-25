// Backstube Morgenrot: der Tag verläuft beim Scrollen. Bilder sind groß: pro Etappe kurz stehen bleiben, damit sie scharf werden. ~16 s
export const meta = {};

export default async function tour(t) {
  await t.hold(1.4);
  for (const [p, sec] of [[0.14, 1.0], [0.30, 1.0], [0.46, 1.0], [0.62, 1.0], [0.78, 1.0]]) {
    await t.prog('.day', p - 0.14 < 0 ? 0 : p - 0.14, p, sec, 'inOut');
    await t.hold(0.7);
  }
  await t.scroll('#tuete', 0.9, {offset: 10});
  await t.tap('[data-step="1"]', {idx: 0, move: 0.5, after: 0.15});
  await t.tap('[data-step="1"]', {idx: 0, move: 0.2, after: 0.1});
  await t.tap('[data-step="1"]', {idx: 2, move: 0.4, after: 0.15});
  await t.hold(1.8);
}
