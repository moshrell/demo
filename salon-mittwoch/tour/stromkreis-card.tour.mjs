// Elektro Brakhage: 3D-Haus wird beim Scrollen von Nacht zu Tag, Preise je Leistung, Vorher/Nachher-Regler. ~17 s
export const meta = {};
export default async function tour(t) {
  await t.hold(1.6);
  await t.prog('[data-h3]', 0, 0.5, 2.8, 'inOut');
  await t.hold(0.5);
  await t.prog('[data-h3]', 0.5, 1, 2.8, 'inOut');
  await t.hold(0.8);
  await t.scroll('#preise', 1.0, {offset: 60});
  await t.tap('#pt-wallbox', {move: 0.5, after: 1.0});
  await t.tap('#pt-pv-speicher', {move: 0.4, after: 1.0});
  await t.scroll('#beweis', 0.9, {offset: 60});
  await t.tap('#cmp-z', {click: false, move: 0.5, after: 0.1});
  await t.anim(1.2, (f) => { t.val = {sel: '#cmp-z', v: String(Math.round(50 + f * 45))}; });
  await t.anim(1.4, (f) => { t.val = {sel: '#cmp-z', v: String(Math.round(95 - f * 85))}; });
  await t.hold(0.6);
}
