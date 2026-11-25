// Salon Nelke: Schaufenster – die Figur wird vom Besucher „geschnitten“ (Frisur, Farbe, Bart). ~15 s
export const meta = {};
export default async function tour(t) {
  await t.hold(1.6);
  await t.tap('[data-hair="locken"]', {move: 0.7, after: 0.8});
  await t.tap('[data-color="#e58aa0"]', {move: 0.5, after: 0.8});
  await t.tap('[data-hair="tolle"]', {move: 0.4, after: 0.8});
  await t.tap('[data-color="#6a8be0"]', {move: 0.4, after: 0.8});
  await t.tap('[data-hair="kurz"]', {move: 0.4, after: 0.6});
  await t.tap('[data-color="#b4562f"]', {move: 0.4, after: 0.6});
  await t.tap('[data-beard="voll"]', {move: 0.4, after: 1.2});
  await t.scroll('#karte', 1.0, {offset: 60});
  await t.tap('#tab-farbe', {move: 0.5, after: 1.4});
}
