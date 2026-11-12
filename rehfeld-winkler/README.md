# Rehfeld & Winkler Rechtsanwälte (демо Kanzlei)

Вымышленная адвокатская контора в Hannover: Arbeitsrecht (трудовое) и Mietrecht (жилищное). Astro, без внешних запросов. Превью на телефоне: https://moshrell.github.io/demo/rehfeld-winkler/ (появляется после сборки GitHub Pages). Адрес на портфолио: `/vorschau/dienstleistung/rehfeld-winkler/`.

    START.bat           # первый запуск ставит пакеты, дальше dev-сервер
    npm run build       # сборка + dist/.htaccess (CSP с хэшами, noindex)
    npm run publish     # сборка + копия в ..\kravets-site\public\vorschau\dienstleistung\rehfeld-winkler

Техзадание: `TZ.txt`. Промпты для Gemini: `PROMPTS.txt` (5 кадров в `public/img/`, jpg, имена как в файле).

## Идея и структура
Первый экран = выбор ситуации «Was ist passiert?» (что случилось). Шесть Fallkarten (карточек случая), у трёх есть Fristrechner (калькулятор срока): Kündigung 3 недели (§ 4 KSchG), Mieterhöhung конец übernächster Monat (§ 558b BGB), Nebenkosten 12 месяцев (§ 556 Abs. 3 BGB). Выбранный случай и дата уходят в форму контакта (`?fall=<id>` + sessionStorage). Страницы: `/`, `/rechtsgebiete/arbeitsrecht|mietrecht/`, `/anwaelte/`, `/kosten/` (с калькулятором Erstberatung), `/faq/`, `/kontakt/`, `/impressum/`, `/datenschutz/`.
Дизайн (сдержанный, по hallmark): белая бумага, хвойно-зелёный акцент (#1f4a42), графит; Source Serif 4 (заголовки, без курсива) + Source Sans 3 (текст); без eyebrow-подписей, без слоганов в заголовках, карточки заменены колонками с линией сверху, шаги — простой нумерованный список. Акордеоны (`<details>`) независимые и без анимации высоты: список раскрывается на месте, страница не прыгает (проверено замером позиции summary: 387 → 387). На телефоне нижняя панель «Anrufen / Termin anfragen»; на Kontakt её нет (там липкая панель формы).
Данные в `src/data/*.json` (`cases.json`, `areas.json`, `team.json`, `faq.json`, `ablauf.json`, `site.json`); логика сроков `src/scripts/frist.ts`.

## Что проверено числами (Playwright, 360/390/768/1280 и 844×390, все 9 страниц)
Нет горизонтального скролла, нет ошибок консоли, один `h1` на странице, все внутренние ссылки ведут на существующие файлы, шрифты загружаются локально. Контраст не ниже 5,3:1. Фристы проверены на примерах: обычный день, Weihnachtstag, Ostermontag, воскресенье, 29 февраля, будущая дата. Форма: ошибки, согласие, данные переживают reload и переход на Datenschutz (открывается в новой вкладке), согласие не восстанавливается.

## Известные недочёты и что не проверено
- **Новый сдержанный стиль визуально не смотрел** (только числа: переполнение, контраст ≥ 6,6:1, функции).
- **Визуально не смотрел** (скриншоты не делал). Нужен один взгляд с телефона: первый экран с выбором ситуации, раскрытая Fallkarte, страница Kosten.
- **Фото нет, пока Степан не положит файлы.** Пока файла нет, рамка показывает простую серую плашку (скрипт в `Base.astro`). Три снимка с людьми и интерьер должны совпасть по стилю: генерировать подряд в одном чате.
- Fristrechner даёт ориентир и всегда показывает более раннюю дату; при Wochenende/Feiertag (Niedersachsen) рядом стоит перенесённая. Праздники считаются по правилам Niedersachsen, особые случаи (Heiligabend/Silvester не праздники) не учтены. Перед реальным клиентом текст и расчёт согласовать с юристом.
- Цифры: Erstberatung 190 € netto (§ 34 RVG, подтверждено), Beratungshilfe 15 € и подача заявления в течение четырёх недель после первой консультации (источник от 05/2026). Перед запуском сверить ещё раз.
- Форма ничего не отправляет (демо). Impressum и Datenschutz фиктивные по содержанию, но с реальной структурой; адрес `Hallerstraße 0`, телефон из «Drama Numbers», e-mail `@example.com`, Versicherer/PR/USt-IdNr вымышлены.
- Имя «Rehfeld & Winkler» проверено веб-поиском (имя + Hannover + ниша), совпадений не найдено.
- Блока отзывов на главной нет (убран как плейсхолдер): для реального клиента добавить настоящие Google-отзывы без правок и без обещаний результата.
- Карта — только ссылка на OpenStreetMap (без встраивания).

## Для реального клиента
Заменить `site.json`, `team.json` (Titel, Fachanwalt, Zulassung), Impressum (Kammer-адрес, Versicherer, Register, USt-IdNr/W-IdNr), Datenschutz, подключить обработку формы и обновить DatenschutzForm; настоящие фото вместо KI-фото (или пометка); `index = true` в `Base.astro` вызовах, sitemap/robots, Google Business Profile.
