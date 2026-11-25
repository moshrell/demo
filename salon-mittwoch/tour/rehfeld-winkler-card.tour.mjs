// Rehfeld & Winkler: „Was ist passiert?“ – Fallkarte öffnen, Fristrechner nennt die Frist. ~14 s
export const meta = {};
export default async function tour(t) {
  await t.hold(1.6);
  await t.scroll('[data-finder]', 1.0, {offset: 60});
  await t.tap('#fall-kuendigung summary', {move: 0.6, after: 0.9});
  await t.tap('#d-kuendigung', {click: false, move: 0.5, after: 0.1});
  await t.anim(0.4, () => { t.val = {sel: '#d-kuendigung', v: '2026-11-05'}; });
  await t.hold(2.0);                                               // Frist wird berechnet
  await t.tap('#fall-mieterhoehung summary', {move: 0.6, after: 1.0});
  await t.hold(1.4);
}
