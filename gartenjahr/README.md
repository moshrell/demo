# Grünhof Gartenbau

Astro-Projekt (Demo). Адрес на портфолио: `/vorschau/handwerk/gartenjahr/`

    START.bat           # первый запуск ставит пакеты, дальше dev-сервер
    npm run build       # сборка + dist/.htaccess (CSP с хэшами, noindex)
    npm run publish     # сборка + копия в ..\kravets-site\public\vorschau\handwerk\gartenjahr

Данные клиента (тексты, цены, часы) — `src/data/site.json`.
Что ещё нужно от клиента — искать `TODO` в проекте.

## Правило форм (всегда, для каждого демо)
Готовый блок: `src/components/OrderForm.astro` (форма) + `src/components/DatenschutzForm.astro` (раздел для `datenschutz.astro`). Если на сайте есть любая форма — брать их, а не писать с нуля:
1. Каждое поле: `label`, понятный placeholder-пример (`Vor- und Nachname`, `z. B. 030 23125 123`, `name@example.com`), `autocomplete`, `type`/`inputmode`.
2. Если собираются имя/телефон/e-mail: обязательный чекбокс согласия (`required`) с целью + ссылка на `${base}datenschutz/`, сообщение об ошибке, если не отмечен. В `datenschutz.astro` раздел про эту форму (Verantwortlicher, Daten, Zweck, Art. 6 Abs. 1 lit. b DSGVO, Speicherdauer, Weitergabe, Rechte Art. 15–21, Beschwerderecht, Freiwilligkeit, Demo-Hinweis).
3. Цены/выбор: итог «Summe» виден по ходу выбора (на мобильном липкая плашка внизу формы) и повторяется в подтверждении. Нет цен: итог не выдумывать, в подтверждении показать сводку выбора (услуга, дата/время).
4. Стили только через токены (`--muted`, `--alert`, `--focus`, `--space-*` в `global.css`: подогнать под дизайн проекта), доступность (focus-visible, aria-invalid, aria-describedby), проверка на 390px.
5. Введённые данные не должны пропадать никогда: sessionStorage-автосохранение (уже встроено в `OrderForm.astro`; ключ `form:<pathname>:<id>`, всё в try/catch), ссылки на Datenschutz/Impressum открываются в новой вкладке (`target="_blank" rel="noopener"`), чекбокс согласия не сохраняется и не восстанавливается, после успешной отправки хранилище очищается. В Datenschutz есть предложение про Zwischenspeicher (уже в `DatenschutzForm.astro`).

## SEO & KI-Sichtbarkeit (AIO) — Standard in jedem Projekt
`Base.astro` liefert: title, description, canonical, Open Graph, Schema.org-JSON-LD (`type`, Adresse, Öffnungszeiten, Preise als `prices`), FAQPage-Markup (`faq`). Checkliste pro Projekt:
1. Ein `<h1>`, logische `<h2>`/`<h3>`, `alt` bei jedem Bild.
2. `type` auf passenden Schema.org-Typ setzen; `site.json`: `openingHours`, `areaServed` füllen (Platzhalter `TODO` nie live).
3. FAQ: dieselben Fragen/Antworten sichtbar auf der Seite UND als `faq`-Prop übergeben.
4. Kundenseite live: `index` setzen (Demos bleiben noindex), sitemap.xml + robots.txt ergänzen, Google Business Profile mit identischen Name/Adresse/Telefon (NAP).

## Demo-Kontaktdaten (fiktiv)
Telefon nur aus den offiziellen «Drama Numbers» der Bundesnetzagentur (z. B. Berlin `030 23125 000–999`, Hamburg `040 66969 000–999`, Köln `0221 4710 000–999`, München `089 99998 000–999`, Frankfurt `069 90009 000–999`), E-Mail nur `@example.com`. Keine Geschäftsdaten-Markup (LocalBusiness) in Demos: `index = false` unterdrückt sie, FAQPage bleibt. Demos bleiben `noindex`.
