// Fernpunkt (Optik): Sehtafel mit verschiebbarer Lupe/Linse, danach Fassungen am Modell anprobieren. ~14 s
export const meta = {};

export default async function tour(t) {
  const pt = (fx, fy) => t.page.evaluate(({fx, fy}) => { const r = document.querySelector('[data-tafel]').getBoundingClientRect(); return {x: r.left + fx * r.width, y: r.top + fy * r.height}; }, {fx, fy});
  await t.hold(2.0);                                                     // Linse fährt auf die Tafel
  await t.drag('[data-linse]', [await pt(0.25, 0.45), await pt(0.7, 0.62), await pt(0.35, 0.82)], 3.2, {move: 0.6});   // Unscharfes wird lesbar
  await t.hold(0.5);
  await t.scroll('#anprobe', 1.0, {offset: 60});
  await t.tap('[data-fassung]', {idx: 2, move: 0.5, after: 1.0});         // Modell trägt die Fassung
  await t.tap('[data-fassung]', {idx: 4, move: 0.4, after: 1.0});
  await t.tap('[data-farben] button', {idx: 1, move: 0.4, after: 1.4});
  await t.hold(0.6);
}
