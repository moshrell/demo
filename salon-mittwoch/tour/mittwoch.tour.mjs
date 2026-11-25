// Сценарий превью Salon Mittwoch. Правило: медленно там, где есть фишка (кресло, въезд, название,
// калькулятор, ножницы, запись), и быстро там, где показывать нечего. Всё в секундах.
export const meta = {
  kicker: 'Demo-Website · Friseur',
  title: 'Salon Mittwoch',
  sub: '3D-Intro, Preisrechner und Online-Terminbuchung',
  bg1: '#3a2218', bg2: '#0b0807', ink: '#f3ead8', posterAt: 16,
};

export default async function tour(t) {
  // 1. Заставка: кресло разворачивается, камера въезжает в спинку, название улетает в шапку
  if (process.env.SKIP_INTRO) { t.sy = await t.introY(1.0); await t.hold(2.5); } else {
  await t.hold(1.0);
  await t.intro(0, 0.44, 6.0);            // разворот кресла (фишка, медленно)
  await t.hold(0.5);
  await t.intro(0.44, 0.66, 3.6);         // «садимся» в кресло (фишка)
  await t.intro(0.66, 0.78, 1.6);         // название на чёрном
  await t.intro(0.78, 0.8, 0.3);          // порог: название летит в шапку
  await t.hold(2.2);
  await t.intro(0.8, 1.0, 1.0);
  await t.hold(1.0);                      // первый экран сайта

  }

  // 2. О салоне: просто мелькнуть
  await t.scroll('#salon', 1.4);
  await t.hold(0.9);

  // 3. Прайс: калькулятор с бегущей суммой (фишка)
  await t.scroll('#leistungen', 1.3, {offset: 10});
  await t.hold(0.6);
  await t.tap('#leistungen [data-len="2"]');
  await t.tap('#leistungen .add', {idx: 0});
  await t.tap('#leistungen .add', {idx: 2});
  await t.hold(1.6);
  await t.tap('#leistungen .go');         // «Mit Auswahl buchen» (выбор уезжает в форму записи)

  // 4. Пролёт вниз: ножницы медленно, остальное быстро
  await t.scroll('#cut', 1.2);
  const cutEnd = await t.page.evaluate(() => { const c = document.querySelector('#cut'); return c.getBoundingClientRect().bottom + scrollY - innerHeight; });
  await t.scroll(cutEnd, 3.8, {e: 'linear'});   // ножницы режут занавес (фишка)
  await t.scroll('#arbeiten', 1.2);
  await t.hold(0.9);
  await t.scroll('#team', 1.0);
  await t.hold(0.7);
  await t.scroll('#stimmen', 1.0);
  await t.hold(0.8);

  // 5. Запись: выбор уехал из калькулятора, дальше день, время, данные
  await t.scroll('#termin', 1.2, {offset: 70});
  await t.hold(1.0);
  const next = '#termin .next';
  await t.tap(next);
  await t.tap('#termin .days button', {idx: 1});
  await t.hold(0.4);
  await t.tap(next);
  (await t.tap('#termin .slots button:not(:disabled)', {idx: 3})) || (await t.tap('#termin .windows button', {idx: 0}));
  await t.hold(0.4);
  await t.tap(next);
  await t.type('#f-name', 'Maria Beispiel');
  await t.type('#f-tel', '0511 1234567');
  await t.tap('#f-privacy');
  await t.hold(0.5);
  await t.tap(next);
  await t.hold(0.4);
  await t.scroll('#termin .done', 0.9, {offset: 120});
  await t.hold(2.4);                      // подтверждение

  // 6. Финал
  await t.scroll('#kontakt', 1.6);
  await t.hold(1.4);
}
