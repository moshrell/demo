// Richtfest (Thielking Bau): Grundstücks-Check-Teaser, dann „Stein für Stein“: Bau wächst beim Scrollen. ~14 s
export const meta = {};

export default async function tour(t) {
  await t.hold(1.2);
  await t.scroll('#check', 1.0, {offset: 20});
  await t.hold(1.6);                                          // Haus wird auf Flurstück gezogen
  await t.scroll('#bauablauf', 0.9);
  await t.prog('#bauablauf', 0.08, 0.5, 4.0, 'linear');        // Bodenplatte, Mauern, Decke
  await t.prog('#bauablauf', 0.5, 0.96, 4.0, 'linear');        // Dachstuhl, Ausbau, Schlüssel
  await t.hold(1.2);
}
