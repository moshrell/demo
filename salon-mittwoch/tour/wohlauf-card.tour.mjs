// Wohlauf Physiotherapie: Körperfigur – Zonen leuchten auf (Schulter, Knie, hinten Rücken), dann Rezept-Kürzel und Kostenweg. ~17 s
export const meta = {};
export default async function tour(t) {
  await t.hold(0.8);
  await t.scroll('#figur', 0.9, {offset: 40});
  await t.hold(0.5);
  await t.tap('[data-zone="schulter"]', {move: 0.6, after: 1.4});
  await t.tap('[data-zone="knie"]', {move: 0.5, after: 1.4});
  await t.tap('[data-face="back"]', {move: 0.5, after: 0.7});
  await t.tap('[data-zone="ruecken"]', {move: 0.5, after: 1.5});
  await t.scroll('#leistungen', 0.9, {offset: 40});
  await t.tap('[data-rx-btn="MT"]', {move: 0.5, after: 0.9});
  await t.tap('[data-rx-btn="KGG"]', {move: 0.4, after: 1.0});
  await t.scroll('#kosten', 0.9, {offset: 40});
  await t.tap('#way-privat', {move: 0.5, after: 0.9});
  await t.tap('#way-selbst', {move: 0.4, after: 1.1});
}
