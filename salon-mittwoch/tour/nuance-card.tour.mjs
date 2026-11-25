// Nuance: schwebende Farbtropfen, Looks (Tonwahl), Vorher/Nachher-Regler. ~15 s
export const meta = {};
export default async function tour(t) {
  await t.hold(3.2);                                              // Tropfen schweben
  await t.scroll('#looks', 1.0, {offset: 60});
  await t.tap('#tab-magenta', {move: 0.6, after: 1.1});
  await t.tap('#tab-honig', {move: 0.4, after: 1.1});
  await t.tap('#tab-salbei', {move: 0.4, after: 1.3});
  await t.scroll('#vorher-nachher', 1.0, {offset: 60});
  await t.tap('.ba__range', {click: false, move: 0.5, after: 0.1});
  await t.anim(1.3, (f) => { t.val = {sel: '.ba__range', v: String(Math.round(50 + f * 45))}; });
  await t.anim(1.6, (f) => { t.val = {sel: '.ba__range', v: String(Math.round(95 - f * 90))}; });
  await t.hold(0.6);
}
