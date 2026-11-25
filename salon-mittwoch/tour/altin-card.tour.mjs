// Altın Tepsi: Pistazien-Baklava in die Box legen, Box füllt sich. ~12 s
export const meta = {};

export default async function tour(t) {
  await t.hold(1.6);                                   // Hero mit Spiel
  await t.scroll('#sorten', 1.0, {offset: 20});
  await t.hold(0.5);
  await t.tap('[data-var="pistazie"] .dish__add', {move: 0.5, after: 0.2});
  await t.tap('[data-var="pistazie"] [data-act="plus"]', {move: 0.3, after: 0.1});
  await t.tap('[data-var="pistazie"] [data-act="plus"]', {move: 0.2, after: 0.1});
  await t.tap('[data-var="walnuss"] .dish__add', {move: 0.5, after: 0.2});
  await t.tap('[data-var="sarma"] .dish__add', {move: 0.4, after: 0.2});
  await t.scroll('#box', 1.3, {offset: 20});
  await t.hold(1.8);                                   // Tablett mit Stücken und Summe
}
