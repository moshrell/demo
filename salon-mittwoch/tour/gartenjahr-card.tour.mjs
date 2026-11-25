// Grünhof Gartenbau: Garten im Jahreslauf – Frühling, Sommer, Herbst, Winter. ~16 s
export const meta = {};
export default async function tour(t) {
  await t.hold(2.0);
  await t.scroll('#fruehling', 1.0, {offset: 0});   await t.hold(1.8);
  await t.scroll('#sommer', 1.0, {offset: 0});      await t.hold(1.8);
  await t.scroll('#herbst', 1.0, {offset: 0});      await t.hold(1.8);
  await t.scroll('#winter', 1.0, {offset: 0});      await t.hold(2.0);
}
