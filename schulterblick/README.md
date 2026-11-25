# Schulterblick Fahrschule

Astro-Projekt (Demo, Fahrschule). Адрес на портфолио: `/vorschau/auto/schulterblick/`

    START.bat           # первый запуск ставит пакеты, дальше dev-сервер
    npm run build       # сборка + плашка ИИ + dist/.htaccess (CSP с хэшами, noindex)
    npm run publish     # сборка + копия в ..\kravets-site\public\vorschau\auto\schulterblick

## Идея: «Streckenkarte»
Сайт = дорога к правам. Hero и 7 станций (Anmeldung, Papiere, Theorie, Fahrstunden, Sonderfahrten, Prüfung, Ziel)
лежат вдоль одной дороги. Машинка едет по ней вслед за скроллом (читающая линия на 46% высоты экрана), знаки
(круг, квадрат, треугольник, ромб, круг с красным кантом, STOP-восьмиугольник, финишная клетка) загораются, когда
машинка их проезжает, на поворотах мигает поворотник.
Каждая станция настраивает цену: Getriebe (Schaltung / Automatik), Alter, Papiere (что уже есть), Lernpaket,
Übungsfahrten (ползунок 10–40, ADAC-диапазон 15–25), Wiederholungs-Puffer. «Zähler» (одометр с катящимися цифрами)
показывает итог: на телефоне в липкой плашке внизу + «Rechnung» (чек) в нижнем листе, на ПК в чек-колонке справа.
Чек делит сумму на «an die Fahrschule» и «direkt an Amt, TÜV/DEKRA und Co.».
Дальше «Rastplatz» (зона отдыха): команда, машины, офис с «открыто сейчас» (берлинское время), FAQ. Форма
Voranmeldung показывает «Dein Plan» + Summe, ничего не отправляет.
Языки: DE / EN / UA (переключатель). Русского нет нигде. Rechtstexte только на немецком.

## Данные
Цены, часы, команда: `src/data/site.json`. Все тексты и переводы: `src/data/i18n.json` (de, en, uk).
Расчёт: `src/scripts/calc.js` (общий для сборки и браузера).

## Фото (Gemini)
`PROMPTS.txt`: 8 промптов. Файлы (jpg) в `public/img/` с точными именами: jana, oleksandr, mehmet, auto-schaltung,
auto-automatik, auto-elektro, haus, theorieraum. Пока файла нет, блок показывает нейтральную плашку.

## Что вымышлено (в демо) и должен подтвердить клиент (в реальном проекте)
- Название, адрес («Musterweg 1», Gehrden), телефон (`05108 000 000`, заведомо нерабочий), e-mail `.example`.
- ВСЕ цены (Grundbetrag, Fahrstunde, Sonderfahrt, Prüfungsgebühren, Lernpaket, Papiere) — Musterwerte в рамках диапазона ADAC 2025
  (Fahrstunde 55–77 €, Sonderfahrt 60–95 €, итого 2.500–4.500 €). Реальные цены клиента: `TODO vom Kunden`.
- Расписание теории (Mo/Do DE, Di EN, Mi UA, 18:30), часы работы офиса, «Rückruf innerhalb eines Werktags»,
  правило «Grundbetrag bei Anmeldung, дальше урок за уроком», языки инструкторов, парк машин.
- Факты закона (Klasse B: 12 Sonderfahrten = 5 Überland + 4 Autobahn + 3 Dämmerung; Theorie 30 Fragen, до 10 Fehlerpunkte;
  BF17 с 16½; Probezeit 2 Jahre; «nur Automatik» = Schlüsselzahl 78): перед боем сверить с актуальными правилами.
- Impressum/Datenschutz: шаблон, данные клиента = `TODO vom Kunden` (имя, адрес, Handelsregister, USt-IdNr., Fahrschulerlaubnis,
  хостер/AVV, срок логов). Перед боем проверить юристом.
- WhatsApp: поле `whatsapp` в `site.json` пустое, кнопки нет.

## Performance (17.11.2026)
- Расчёт длины пути: шаг выборки 4→12 с линейной интерполяцией (`lengthAtY` в `src/scripts/app.js`), `relayout` с задержкой 120 мс — иначе TBT ~1 с на слабых устройствах.
- Bei neuen Änderungen: Lighthouse mobil prüfen (Ziel: TBT unter 200 ms, CLS unter 0,1).
