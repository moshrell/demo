// Sechsgang: Navigation = Schalthebel in der H-Kulisse; jeder Gang = eine Seite. ~13 s
export const meta = {};

export default async function tour(t) {
  const pt = async (vx, vy) => t.page.evaluate(({vx, vy}) => { const r = document.querySelector('[data-gate]').getBoundingClientRect(); return {x: r.left + vx / 300 * r.width, y: r.top + vy / 200 * r.height}; }, {vx, vy});
  const C1 = 113.33, C2 = 186.67, C3 = 260;
  await t.hold(1.4);
  await t.drag('[data-knob]', [await pt(C1, 100), await pt(C1, 40)], 1.3);            // N → 1
  await t.hold(1.0);
  await t.drag('[data-knob]', [await pt(C1, 100), await pt(C1, 160)], 0.9);           // 1 → 2
  await t.hold(0.8);
  await t.drag('[data-knob]', [await pt(C1, 100), await pt(C2, 100), await pt(C2, 40)], 1.4);   // 2 → 3
  await t.hold(0.8);
  await t.drag('[data-knob]', [await pt(C2, 100), await pt(C3, 100), await pt(C3, 160)], 1.6);  // 3 → 6
  await t.hold(1.6);
}
