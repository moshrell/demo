// Kehlenbrink: Startseite kurz, dann in den Bad-Baukasten (/bad/): Größe, Dusche, Doppelwaschtisch, Fliese, Preis läuft. ~16 s
export const meta = {};

export default async function tour(t) {
  await t.hold(2.2);                                                        // Startseite, 3D-Bad lädt
  await t.scroll(900, 1.0);                                                 // weiter nach unten: Leistungen
  await t.hold(0.6);
  await t.go('bad/', 1.6);                                                  // Baukasten-Seite
  await t.tap('[data-bk-size][value="L"] + span', {move: 0.6, after: 0.9});
  await t.tap('[data-bk-opt="wanne"][value="dusche"] + span', {move: 0.5, after: 1.1});
  await t.tap('[data-bk-tab="waschen"]', {move: 0.4, after: 0.2});
  await t.tap('[data-bk-opt="waschen"][value="doppel"] + span', {move: 0.4, after: 1.1});
  await t.tap('[data-bk-tab="fliese"]', {move: 0.4, after: 0.2});
  await t.tap('[data-bk-opt="fliese"][value="salbei"] + span', {move: 0.4, after: 1.8});
}
