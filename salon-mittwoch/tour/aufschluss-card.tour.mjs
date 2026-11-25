// Aufschluss Schlüsseldienst: Intro, Umschalter Notfall ↔ Vorsorge, Festpreis-Rechner. ~15 s
export const meta = {};
export default async function tour(t) {
  await t.hold(3.2);
  await t.tap('[data-mode-btn="vorsorge"]', {move: 0.7, after: 1.0});
  await t.tap('label:has(input[name="thema"][value="wohnung"])', {move: 0.5, after: 0.5});
  await t.tap('label:has(input[name="thema"][value="tresor"])', {move: 0.4, after: 1.0});
  await t.tap('[data-mode-btn="notfall"]', {move: 0.5, after: 0.8});
  await t.tap('label:has(input[name="art"][value="abgeschlossen"])', {move: 0.5, after: 1.0});
  await t.type('#r-plz', '30451', 8);
  await t.hold(1.8);
}
