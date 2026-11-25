// Tischlerei Wendholm: Möbel entsteht beim Scrollen, dann Konstruktor mit ein paar Klicks. ~17 s
export const meta = {};

export default async function tour(t) {
  await t.hold(1.0);
  await t.scroll('[data-track]', 0.8);
  await t.prog('[data-track]', 0, 0.55, 3.0, 'inOut');   // Schrank wird gebaut
  await t.prog('[data-track]', 0.55, 1, 1.8, 'inOut');
  await t.hold(0.9);
  await t.go('konstruktor/?v=schrank', 1.4);
  await t.tap('[data-tab="masse"]', {move: 0.6, after: 0.3});
  await t.tap('[data-act="n:1"]', {move: 0.5, after: 0.9});               // ein Feld mehr
  await t.tap('[data-act="inc:fb:10"]', {move: 0.4, after: 0.9});         // breiter
  await t.tap('[data-tab="holz"]', {move: 0.4, after: 0.3});
  await t.tap('[data-act="set:holz:n"]', {move: 0.4, after: 1.5});        // Nussbaum
}
