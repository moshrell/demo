// Hallbach Architekten: Hero Foto ↔ Bauplan, Honorarrechner mit laufender Summe. ~15 s
export const meta = {};
export default async function tour(t) {
  await t.hold(1.4);
  await t.tap('[data-set="plan"]', {move: 0.7, after: 1.6});      // Foto wird zum Plan
  await t.tap('[data-set="photo"]', {move: 0.5, after: 1.0});
  await t.scroll('#honorar', 1.2, {offset: 60});
  await t.tap('label:has(input[name="type"][value="umbau"])', {move: 0.5, after: 0.7});
  await t.tap('input[name="area-range"]', {click: false, move: 0.5, after: 0.1});
  await t.anim(1.6, (f) => { t.val = {sel: 'input[name="area-range"]', v: String(Math.round(140 + f * 120))}; });
  await t.tap('label:has(input[name="level"][value="gehoben"])', {move: 0.5, after: 0.8});
  await t.tap('label:has(input[name="scope"][value="rundum"])', {move: 0.4, after: 1.8});
}
