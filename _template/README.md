# __NAME__

Astro-Projekt (Demo). Адрес на портфолио: `/vorschau/__CATEGORY__/__SLUG__/`

    START.bat           # первый запуск ставит пакеты, дальше dev-сервер
    npm run build       # сборка + dist/.htaccess (CSP с хэшами, noindex)
    npm run publish     # сборка + копия в ..\kravets-site\public\vorschau\__CATEGORY__\__SLUG__

Данные клиента (тексты, цены, часы) — `src/data/site.json`.
Что ещё нужно от клиента — искать `TODO` в проекте.

## Правило форм (всегда, для каждого демо)
Готовый блок: `src/components/OrderForm.astro` (форма) + `src/components/DatenschutzForm.astro` (раздел для `datenschutz.astro`). Если на сайте есть любая форма — брать их, а не писать с нуля:
1. Каждое поле: `label`, понятный placeholder-пример (`Vor- und Nachname`, `z. B. 0511 1234567`, `name@beispiel.de`), `autocomplete`, `type`/`inputmode`.
2. Если собираются имя/телефон/e-mail: обязательный чекбокс согласия (`required`) с целью + ссылка на `${base}datenschutz/`, сообщение об ошибке, если не отмечен. В `datenschutz.astro` раздел про эту форму (Verantwortlicher, Daten, Zweck, Art. 6 Abs. 1 lit. b DSGVO, Speicherdauer, Weitergabe, Rechte Art. 15–21, Beschwerderecht, Freiwilligkeit, Demo-Hinweis).
3. Цены/выбор: итог «Summe» виден по ходу выбора (на мобильном липкая плашка внизу формы) и повторяется в подтверждении. Нет цен: итог не выдумывать, в подтверждении показать сводку выбора (услуга, дата/время).
4. Стили только через токены (`--muted`, `--alert`, `--focus`, `--space-*` в `global.css`: подогнать под дизайн проекта), доступность (focus-visible, aria-invalid, aria-describedby), проверка на 390px.
5. Введённые данные не должны пропадать никогда: sessionStorage-автосохранение (уже встроено в `OrderForm.astro`; ключ `form:<pathname>:<id>`, всё в try/catch), ссылки на Datenschutz/Impressum открываются в новой вкладке (`target="_blank" rel="noopener"`), чекбокс согласия не сохраняется и не восстанавливается, после успешной отправки хранилище очищается. В Datenschutz есть предложение про Zwischenspeicher (уже в `DatenschutzForm.astro`).
