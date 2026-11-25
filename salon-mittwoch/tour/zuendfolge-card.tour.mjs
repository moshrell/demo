// Zündfolge: Armaturenbrett macht den Selbsttest, Warnlampe anwählen, Bordcomputer „Symptom → Befund“. ~16 s
export const meta = {};
export default async function tour(t) {
  await t.hold(3.4);                                              // Selbsttest: Lampen, Zeiger, Zylinder 1-3-4-2
  await t.tap('[data-pick="oel"]', {move: 0.7, after: 1.2});      // Öldruck-Lampe
  await t.scroll('#diagnose', 1.0, {offset: 60});
  await t.tap('.sym[data-id="bremse"]', {move: 0.5, after: 1.4});
  await t.tap('#tab-geraeusche', {move: 0.5, after: 0.5});
  await t.tap('.sym[data-id="klopfen"]', {move: 0.5, after: 1.6});
  await t.tap('#tab-faellig', {move: 0.4, after: 1.2});
}
