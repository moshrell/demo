# Richtfest · Thielking Bau (Demo Bauunternehmen)

Статус: **собран, кадры стройки и 4 из 5 Referenzen подключены (11.11.2026).** Не хватает `ref-sanierung` и `karriere-azubi` (`PROMPTS.txt`): пока их нет, карточка Sanierung и фото на Karriere просто не выводятся (`src/lib/img.ts → has()`). Оригиналы jpg: `D:\Webdesign\richtfest\img\`, в сайте webp (полный + `-s` половинный) в `public/img/`.
Живая версия: https://moshrell.github.io/demo/richtfest/ · портфолио: `/vorschau/bau/richtfest/`
Бриф: `_briefs/bau/01_bauunternehmen_richtfest.txt` · ТЗ от владельца: `TZ.txt` · модуль участка: `_briefs/_module/grundstueck-adresse.txt`.
Фирма вымышленная (Thielking Bau GmbH, Gehrden), проверено веб-поиском 06.11.2026.

## Что где
- `src/components/Bauablauf.astro` — главная сцена: GSAP ScrollTrigger (pin + scrub + snap к фазам), SplitText (заголовок), ScrollToPlugin (точки фаз). Фазы и проценты оплаты: `src/data/phasen.json`. Без JS и при reduced-motion — те же фазы списком.
- `src/pages/grundstueck.astro` + `src/scripts/geo.ts` — Grundstücks-Check: Photon (адрес) → LGLN WFS `alkis_wfs_einfach` (Flurstück + здания, GML, EPSG:25832) → SVG-план, GSAP Draggable + Inertia (дом, вершины), DrawSVG (контур), отступ 0,4 H / мин. 3 м (NBauO § 5 Abs. 2), GRZ, Kostenrahmen. Типы домов и цены: `src/data/haustypen.json`.
- `src/components/AnfrageForm.astro` — Projektanfrage (стандарт OrderForm + план участка из Check через sessionStorage).
- `src/pages/referenzen.astro` — фильтр с GSAP Flip.
- Переходы между страницами: CSS `@view-transition` (без JS), при reduced-motion выключены. Появление блоков: CSS `animation-timeline: view()`.
- CSP: `scripts/htaccess.mjs`, `connect-src` разрешает только photon.komoot.io и opendata.lgln.niedersachsen.de.

## Осознанные исключения
- **Внешние запросы** (вопреки правилу «без внешних запросов»): только в Grundstücks-Check и только по кнопке «Grundstück suchen». Описано в Datenschutz (`#grundstueck`). Альтернативы без передачи: «Maße selbst eingeben», «Beispielgrundstück» (выдуманный участок).
- Только Niedersachsen (данные LGLN). Вне земли — сообщение и ручной ввод.

## Проверено (headless, Chromium)
- Ширины 320/390/1024/1220/1280/1440 и 844×390: нет горизонтального скролла, кнопки в одну строку, ошибок JS нет.
- Сцена: каждая прокрутка = одна фаза (snap к меткам), 0→6, панель не перекрывается нижней панелью, на 320×568 картинка ≥ половины экрана.
- Check с реальными данными: «Dammstraße 10, Gehrden» → Flurstück 307/1, 413 м², здания; перетаскивание, типы, цены; передача в Anfrage со схемой.
- Формы: ошибки и фокус, автосохранение после перезагрузки, согласие не восстанавливается, Datenschutz в новой вкладке, подтверждение со сводкой. PLZ-проверка. Reduced-motion и без JS: список фаз.

## Не проверено / известные недочёты
- Выноски на фазах (`notes` в `phasen.json`, % кадра 3:4) выставлены по готовым кадрам и проверены скриншотами на телефоне и ПК. `phase-6-tag` (готовый дом днём) пока не используется.
- Реальная плавность pin-сцены на iPhone/Android (адресная строка) — проверить на телефоне.
- Объединение двух Flurstücke в одно не сделано (можно выбрать соседний тапом и подправить вершины).
- Высота H для отступа упрощена (одна «Wandhöhe» на тип дома, без фронтонов и рельефа).
- В Datenschutz — `TODO` по хостингу (данные реального клиента).

## Источники и лицензии
- Кадастр: LGLN, Liegenschaftskataster, CC BY 4.0 (подпись на странице и в Impressum).
- Поиск адреса: Photon (komoot), данные © OpenStreetMap, ODbL.
- GSAP 3.15 (бесплатно, включая плагины), шрифты Archivo и Martian Mono (OFL, @fontsource-variable).
