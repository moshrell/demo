# Richtfest · Thielking Bau (Demo Bauunternehmen)

Статус: **собран, все кадры подключены (11.11.2026).** Если кадра нет, блок не выводится (`src/lib/img.ts → has()`), заглушек нет. Оригиналы jpg: `D:\Webdesign\richtfest\img\`, в сайте webp (полный + `-s` половинный) в `public/img/`.
Живая версия: https://moshrell.github.io/demo/richtfest/ · портфолио: `/vorschau/bau/richtfest/`
Правки дизайна по `DESIGN_FIX.txt` сделаны (11.11.2026). **Не сделано: «три круга правок не по дизайну» от Степана — текста нет в репозитории, ждём.**
Бриф: `_briefs/bau/01_bauunternehmen_richtfest.txt` · ТЗ от владельца: `TZ.txt` · модуль участка: `_briefs/_module/grundstueck-adresse.txt`.
Фирма вымышленная (Thielking Bau GmbH, Gehrden), проверено веб-поиском 06.11.2026.

## Что где
- `src/components/HeroFirma.astro` — первый экран главной: фото дома, кто фирма, CTA (на телефоне CTA в нижней панели).
- `src/components/CheckTeaser.astro` — тёмный блок `#check` после «Was planen Sie?»: адрес → `/grundstueck/?q=`, ссылки `?bsp=1`/`?manuell=1`, живой пример-план (GSAP Draggable + DrawSVG).
- `src/pages/fuer-betriebe.astro` — страница для покупателя сайта (как заявка приходит фирме); в меню нет, ссылка в подвале.
- `src/components/Bauablauf.astro` — сцена «So wird gebaut» (на главной ниже Check и «Was planen Sie?»): GSAP ScrollTrigger (pin + scrub + snap к фазам), SplitText (заголовок), ScrollToPlugin (точки фаз). Фазы и проценты оплаты: `src/data/phasen.json`. Без JS и при reduced-motion — те же фазы списком.
- `src/pages/grundstueck.astro` + `src/scripts/geo.ts` — Grundstücks-Check: Photon (адрес) → LGLN WFS `alkis_wfs_einfach` (Flurstück + здания, GML, EPSG:25832) → SVG-план, 3 шага (1 Grundstück → 2 Haus: размеры + Bauart → 3 Ergebnis & Kosten); план липкий вверху на телефоне, инструменты внутри плана, нижняя панель с вердиктом и «Weiter: Kosten»/«Anfragen»; на застроенном участке сначала вопрос «Bestand bleibt / Abriss und Neubau»; цены включает `preiseZeigen` в `haustypen.json` (в демо true). Photon → запасной Nominatim. GSAP Draggable + Inertia (дом, вершины), DrawSVG (контур), отступ 0,4 H / мин. 3 м (NBauO § 5 Abs. 2), GRZ, Kostenrahmen. Типы домов и цены: `src/data/haustypen.json`.
- `src/components/AnfrageForm.astro` — Projektanfrage (стандарт OrderForm + план участка из Check через sessionStorage).
- `src/pages/referenzen.astro` — фильтр с GSAP Flip.
- Переходы между страницами: CSS `@view-transition` (без JS), при reduced-motion выключены. Появление блоков: CSS `animation-timeline: view()`.
- CSP: `scripts/htaccess.mjs`, `connect-src` разрешает только photon.komoot.io и opendata.lgln.niedersachsen.de.

## Решения 11.11.2026 (по замечаниям Степана)
- Оплата в сцене: «Rate X %» и «Gesamt bezahlt Y %» (раньше «+15 %» рядом с накопленным итогом путало).
- Порядок «Was planen Sie?» = порядок блоков на `/leistungen/` (Neubau, Anbau, Sanierung, Rohbau).
- Referenzen: в чипах счётчики (Neubau 1, Anbau 2 …); тёмный фон из-за схлопывания сетки при Flip убран (min-height держится на время анимации).
- Главная строится вокруг Check; слайдер-сцена перенесена ниже как «Ablauf».

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
- Photon из облачной песочницы 11.11 временно не отвечал (туннель прокси), поиск адреса проверен с подменой ответа Photon + живой LGLN; в проде публичный Photon может ограничивать частые запросы.
- Реальная плавность pin-сцены на iPhone/Android (адресная строка) — проверить на телефоне.
- Объединение двух Flurstücke в одно не сделано (можно выбрать соседний тапом и подправить вершины).
- Высота H для отступа упрощена (одна «Wandhöhe» на тип дома, без фронтонов и рельефа).
- В Datenschutz — `TODO` по хостингу (данные реального клиента).

## Источники и лицензии
- Кадастр: LGLN, Liegenschaftskataster, CC BY 4.0 (подпись на странице и в Impressum).
- Поиск адреса: Photon (komoot), данные © OpenStreetMap, ODbL.
- GSAP 3.15 (бесплатно, включая плагины), шрифты Archivo и Martian Mono (OFL, @fontsource-variable).

## Проверено 11.11.2026 (после DESIGN_FIX)
- Check: пример-участок на 390×780 и 1366×768, застроенный участок (Gehrden, Steinweg; Photon замокан, LGLN живой): вопрос Anbau/Abriss, оба ответа, нет JS-ошибок.
- Все 10 страниц на 320/390/768/1366 и 780×360: нет горизонтального скролла, один h1, нет двухстрочных кнопок, нет ошибок консоли.
- Не проверено: реальные устройства; Photon/Nominatim из облака недоступны (fallback проверен только логикой); reduced-motion на новых блоках визуально; D:\Webdesign\richtfest не обновлён (источник правды — репозиторий).
