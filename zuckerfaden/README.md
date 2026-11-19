# zuckerfaden — демо косметического кабинета «Kosmetik Zuckerfaden» (вымышленный, Ronnenberg)

Просмотр: https://moshrell.github.io/demo/zuckerfaden/ · ТЗ: `_briefs/kosmetik/01_kosmetik_zuckerfaden.txt` · Фото: `PROMPTS.txt`
Портфолио: `/vorschau/kosmetik/zuckerfaden/` (категорию `kosmetik` проверить в kravets-site works.ts перед публикацией).

## Статус (19.11.2026)
Собраны все страницы по ТЗ: Start, Sugaring, Gesicht, Preise, Über mich, Gutschein, Termin, Impressum, Datenschutz.
Ждём от Степана `hero-9x16.jpg` (и `hero-16x9.jpg`) в `public/img/`. Пока героем стоит `haende-3x4.jpg` (fallback в `Foto.astro`).

## Как устроено
- `src/data/*.json` — все тексты, цены, часы, зоны, процедуры, пары шрифтов. Переход на реального клиента = замена JSON (см. ТЗ).
- `src/lib/figur.mjs` — силуэты Damen/Herren спереди/сзади и лицо, построены кодом из параметров (детали-«выкройки»).
- `src/lib/cart.ts` — общая «корзина» (sessionStorage), комбинации (Beine komplett, Gesicht komplett), «inklusive» для зон лица при процедуре лица.
- `src/scripts/honig.ts` — медовая нижняя панель: одно стекло с backdrop-filter, обрезанное `clip-path: path()` (овал + пилюля Summe + перемычка + нити к блокам `[data-honig]`). Нить появляется, когда медовый блок уходит из-под панели вверх, рвётся на 104 px. Без prefers-reduced-motion нитей нет.
- `src/scripts/ui.ts` — шторки (`<dialog>`), пилюля, часы работы по Europe/Berlin, проба шрифтов (`?schrift=a|b|c|d`, localStorage; пары B/C/D грузятся лениво).
- `scripts/bilder.mjs` — интеграция Astro: WebP 480/960/1440 из `public/img/*.jpg` при каждой сборке (в т. ч. на GitHub Actions). `public/img/w/` в .gitignore.
- Формы: свой `lib/formular.ts` по правилам шаблонного OrderForm (label, примеры, ошибки у полей, автосохранение без галочки согласия, очистка после отправки). OrderForm/DatenschutzForm удалены как неиспользуемые.

## Проверено (числами, headless Chrome)
- pagecheck на 390×844, 360×740, 768×1024, 844×390, 1440×900 для всех страниц: нет горизонтальной прокрутки, нет ошибок консоли, после перезагрузки страница сверху. Предупреждения только ожидаемые: skip-ссылка за краем, горизонтальная лента якорей на Preise, `.sr`-заголовок.
- Сценарии: зоны касанием → Summe/Dauer, подсказка Beine komplett и её принятие, панель лица, «inklusive» при процедуре лица, подбор процедуры, пилюля; Termin: ошибки, сохранение после перезагрузки, Abend блокируется без Di/Do, карточка подтверждения; Gutschein: свой Betrag; смена шрифта сохраняется между страницами.
- Нить медовой панели посмотрена на скриншотах (24/56/88 px и разрыв).
- Контраст: kandis на медовых блоках ≥ 5:1 (градиент до `--honig-tief`), вторичный текст 6.3:1, placeholder 4.7:1.

## Не проверено / известные недочёты
- На настоящем телефоне не смотрели: плавность нити и backdrop-filter на слабых Android, iOS Safari (clip-path: path + backdrop-filter).
- Над тёмными фото медовая панель темнеет; подписи «Menü/Anrufen» остаются читаемыми на скриншотах, но на живом устройстве не измерено.
- В альбомной ориентации телефона силуэт (мин. 22rem) выше экрана — прокручивается, но целиком не виден.
- Ссылка «Bewertungen auf Google» в демо — заглушка (TODO), у реального клиента её профиль.
- Impressum: USt/Kleinunternehmer и Hosting в Datenschutz — TODO от клиента.
