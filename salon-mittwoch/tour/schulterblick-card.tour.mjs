// Schulterblick: Streckenkarte – Auto fährt beim Scrollen, Zähler (Odometer) rollt mit den Wahlen. ~14 s
export const meta = {};

export default async function tour(t) {
  await t.hold(1.2);                                                   // Hero, Straße
  await t.scroll('#station-1', 1.1, {offset: 70});
  await t.tap('label.opt:has(input[value="automatik"])', {move: 0.5, after: 0.5});   // Summe ändert sich
  await t.tap('label.opt:has(input[value="17"])', {move: 0.4, after: 0.5});
  await t.scroll('#station-3', 1.6, {offset: 70});                      // Auto fährt weiter
  await t.hold(0.5);
  await t.scroll('#station-4', 1.1, {offset: 70});
  await t.tap('#fahrten', {click: false, move: 0.5, after: 0.1});
  await t.anim(1.6, (f) => { t.val = {sel: '#fahrten', v: String(Math.round(15 + f * 15))}; });   // Übungsfahrten-Regler
  await t.hold(0.6);
  await t.scroll('#station-7', 2.2, {offset: 70, e: 'inOut'});          // Ziel, Gesamtsumme
  await t.hold(1.2);
}
