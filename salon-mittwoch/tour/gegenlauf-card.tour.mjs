// Gegenlauf (Porsche-Werkstatt): Modell wählen, Bereich antippen → Röntgenblick auf das Fahrwerk-Teil, Leistungen, Summe. ~14 s
export const meta = {};

export default async function tour(t) {
  await t.hold(2.0);                                                  // Showroom, Wagen lädt
  await t.scroll('#service', 0.8, {offset: 70});
  await t.tap('input[name="modell_chip"][value="997"] + span', {move: 0.5, after: 0.3});
  await t.tap('.zchip[data-zone="motor"]', {move: 0.5, after: 1.0});  // Röntgen: Motor leuchtet
  await t.tap('[data-zone-block="motor"] .pos__kopf', {idx: 0, move: 0.5, after: 0.5});
  await t.tap('[data-zone-block="motor"] .pos__kopf', {idx: 2, move: 0.4, after: 0.5});
  await t.tap('.zchip[data-zone="bremsen"]', {move: 0.5, after: 1.0}); // Kamera fährt zu den Bremsen
  await t.tap('[data-zone-block="bremsen"] .pos__kopf', {idx: 0, move: 0.5, after: 0.5});
  await t.hold(1.8);                                                  // Summe
}
