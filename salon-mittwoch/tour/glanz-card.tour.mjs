// Glanzleistung: Intro-Film (Kamerafahrt, kadergenau abgespielt), Hotspot „Folie“, Fahrzeugklasse, Folienfarbe wechseln. ~16 s
export const meta = {};

export default async function tour(t) {
  await t.video('[data-intro-video]', 5.0, {rate: 1.64});       // Intro, 7,5 s Film in 5 s; danach blendet die Seite selbst zur Box über
  await t.hold(2.2);
  await t.tap('[data-hs="folie"]', {move: 0.7, after: 0.8});
  await t.tap('[data-kl="limo"]', {move: 0.6, after: 1.4});    // „Was fährst du?“ (erste Auswahl), danach öffnet sich die Folien-Station
  await t.tap('.swc', {idx: 3, move: 0.6, after: 1.6});        // pistazie
  await t.tap('.swc', {idx: 4, move: 0.4, after: 1.6});        // kirsch
  await t.tap('.swc', {idx: 2, move: 0.4, after: 1.6});        // perlmutt
}
