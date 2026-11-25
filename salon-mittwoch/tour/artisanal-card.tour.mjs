// Artisanal: Croissant wird beim Scrollen gebacken (Shader), dann Vorbestellung. ~13 s
export const meta = {};

export default async function tour(t) {
  await t.hold(0.9);
  await t.prog('.hero', 0, 0.5, 2.6, 'inOut');         // Teigling → Backen
  await t.prog('.hero', 0.5, 1, 2.6, 'inOut');         // goldbraun
  await t.hold(0.6);
  await t.scroll('#vorbestellen', 1.0, {offset: 10});
  await t.tap('[data-row] [data-inc]', {idx: 0, move: 0.5, after: 0.15});
  await t.tap('[data-row] [data-inc]', {idx: 0, move: 0.2, after: 0.1});
  await t.tap('[data-row] [data-inc]', {idx: 1, move: 0.4, after: 0.15});
  await t.tap('[data-row] [data-inc]', {idx: 2, move: 0.4, after: 0.15});
  await t.hold(1.8);                                    // Summe
}
