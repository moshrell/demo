# Demo «zinke»: Tischlerei Wendholm (столярная мастерская)

Статус: **собрано, ждёт фото из `PROMPTS.txt` и ревью Степана.** Живая версия: https://moshrell.github.io/demo/zinke/ (после push в main). Категория в портфолио: handwerk → `/vorschau/handwerk/zinke/`.
Фирма вымышленная: **Tischlerei Wendholm**, мастер Jan Wendholm, Hannover-Ricklingen. Имя «Tischlerei Holm» занято реальной фирмой (Nindorf), см. `RECON.md`; имя лежит в `src/data/site.json`.
Документы: `RECON.md` (разведка), `TZ.txt` (ТЗ от лица владельца: персоны, флоу, механика), `PROMPTS.txt` (17 кадров для Gemini).

## Что внутри
- **Главная** (`/`): шапка со статусом «offen/geschlossen» (по Europe/Berlin), hero, сцена «Möbel entsteht» (3D-сборка по скроллу → фото той же вещи + ab-цена + «im Konstruktor anpassen»), Leistungen und Preise, Werkstoffe (проба тапом), Ablauf, Referenzen, Planer и Hausverwaltung, проверка PLZ, Über die Werkstatt («Was wir nicht machen»), FAQ, форма «Anfrage mit Foto». Снизу на телефоне липкая панель Anrufen · Konstruktor · Anfrage.
- **Konstruktor** (`/konstruktor/`): Einbauschrank (со скосом) / Regal / Tisch (+ пресет Garderobe). Шаги +/−, инструмент + тап по полю, породы и поверхность, «Meister-Hinweise» (прогиб полки с кнопками-решениями), Richtpreis с разбивкой, Werkbuch (7 достижений), «Überrasch mich», ссылка-конфигурация в URL, Abnahme со штампом, форма со сводкой.
- **Impressum / Datenschutz**: Handwerkskammer Hannover, Berufsbezeichnung, HwO; раздел про форму, конструктор (URL/sessionStorage/localStorage), PLZ-проверку.

## Решения
- Стек: Astro + three.js (динамический импорт, только после первого кадра/при подходе к сцене). Шрифты локально (`@fontsource`: Alegreya, Alegreya Sans, Caveat только для размеров/пометок). Без внешних запросов.
- Дизайн (hallmark): bespoke «Werkbank», кастомная тема, токены в `src/styles/tokens.css`. Зинкен-кромка между секциями (`Zinken.astro`) — геометрия, не рисунок.
- **Модель мебели** `src/lib/model.ts`: одна конфигурация → список деталей (боксы/полигоны/цилиндры) → 3D (`scene.ts`), 2D-эскиз (`sketch.ts`), цена, проверки мастера. URL-формат: `?t=s&w=e&o=g&n=4&b=60&h=230&d=60&s=r&k=100&a=45&f=…`.
- Цены демонстрационные: `src/data/kalkulation.json` (netto-ставки + MwSt), `leistungen.json`. На реальном клиенте подставить его честные цифры.
- PLZ-проверка: `plz.json` (GeoNames, CC BY 4.0, Luftlinie до мастерской, ≤60 км) + `zonen.json` (Zone 1 ≤12 км бесплатно, Zone 2 ≤30 км 45 €, Zone 3 ≤60 км по запросу 95 €).
- Текстуры 3D: Poly Haven (CC0): oak_veneer_01, natural_walnut_veneer, white_maple_veneer, rough_pine_door; оттенок и контраст изменены под породу (`public/tex/*.jpg`, ~100–180 КБ).
- Позиции из ТЗ, которые упрощены: Neigung шагом 5°, Höhe шагом 10 cm (не 20); Garderobe/Treppe/Türen в конструкторе — только Garderobe-пресет, остальное через форму.

## Fallback
- Без WebGL или слабое устройство (≤4 ядер/≤4 ГБ → pixelRatio ≤1,5; два раза подряд просадка кадров → pixelRatio 1, затем 2D): Konstruktor целиком в 2D-эскизе (тап по полю, цена, форма), главная — статичный блок «эскиз + фото».
- prefers-reduced-motion: без полёта деталей и стружки, главная без сборки по скроллу.
- Без JS главная читается (цены, Ablauf, FAQ, телефон); интерактивные части не работают.

## Проверено (headless, 390 px и 320/768/1280)
Нет горизонтального скролла, нет ошибок консоли и нарушений CSP (проверено с настоящим CSP из `dist/.htaccess`); контраст токенов ≥5,1:1; флоу: Konstruktor (поля, инструменты, порода, прогиб → кнопка решения, 5× «Überrasch mich» без открытых предупреждений, Abnahme → форма → без согласия ошибка → Datenschutz в новой вкладке данные целы → перезагрузка: конфиг и данные целы, согласие не восстановлено → отправка); главная (сцена на 7 точках скролла, 4 изделия, PLZ: Hannover/Hildesheim/Braunschweig/München, проба дерева, B2B-ссылка включает «Gewerblich» и «Türen», загрузка фото, перезагрузка не теряет данные).

## Известные недочёты
- **Фото ещё нет**: файлы из `PROMPTS.txt` класть в `public/img/` (имена как в промптах). Пока их нет, блоки без фото пустые (проба дерева берёт CC0-текстуру), финальный кроссфейд «модель → фото» не срабатывает, подпись и цена появляются сами.
- Вид 3D глазами не проверялся (только числа: непустой кадр, позиции). Если форма какой-то детали выглядит странно, прислать скриншот.
- Формы ничего не отправляют (демо). Для живого клиента: PHP-отправка на All-Inkl (письмо + сводка конфигурации + фото), правка Datenschutz, Hosting-абзац.
- Impressum: `TODO vom Kunden` в номере Handwerksrolle, Berufshaftpflicht, Verbraucherschlichtung.
- Цены, ставки, срок обратного звонка «2 Werktagen», количество людей и «seit 2006/2009» вымышлены.
- Кнопка «Teilen» использует Web Share API, на ПК копирует ссылку в буфер.

## Лицензии
- Texturen: Poly Haven, CC0. PLZ-координаты: GeoNames, CC BY 4.0 (упомянуть при реальном запуске). Шрифты: OFL (fontsource). three.js: MIT.
