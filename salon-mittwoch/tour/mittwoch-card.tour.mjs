// Ролик для карточки на /arbeiten: экран ПК, ~13 с. Запуск: $env:MODE='card'; node tour\record.mjs mittwoch-card.tour.mjs --no-build
// Фишки Mittwoch: 3D-кресло разворачивается, камера «садится» в него, название, калькулятор с бегущей суммой.
export const meta = {};

export default async function tour(t) {
  await t.hold(0.4);
  await t.intro(0, 0.44, 3.0);           // кресло разворачивается
  await t.intro(0.44, 0.66, 2.2);        // въезд в спинку
  await t.intro(0.66, 0.8, 1.1);         // название на чёрном, летит в шапку
  await t.hold(1.3);                     // первый экран сайта
  await t.scroll('#leistungen', 0.9, {offset: 40});
  await t.tap('#leistungen [data-len="2"]', {move: 0.4, after: 0.15});
  await t.tap('#leistungen .add', {idx: 0, move: 0.4, after: 0.15});
  await t.tap('#leistungen .add', {idx: 2, move: 0.35, after: 0.15});
  await t.hold(1.4);                     // бегущая сумма
}
