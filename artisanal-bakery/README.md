# Artisanal (Café / Bäckerei), демо по брифу

Astro-проект. Адрес на портфолио: `/vorschau/cafe/artisanal-bakery/`

    START.bat           # первый запуск ставит пакеты, дальше dev-сервер
    npm run build       # сборка + dist/.htaccess (CSP с хэшами, noindex)
    npm run publish     # сборка + копия в ..\kravets-site\public\vorschau\cafe\artisanal-bakery

- Тексты, цены, адрес, Impressum-данные: `src/data/bakery.json`
- Hero «выпекание»: `src/scripts/bake.js` (шейдер) + два фото в `public/img/`
- Остальная логика (подсветка слов, Click & Collect): `src/scripts/page.js`
- Чего не хватает от клиента: искать `TODO` (часы работы, телефон, реестр, PDF с аллергенами, фото помещения/команды)
- Зоны получения заказа (`slots`) — примеры, уточнить у клиента

## Performance (17.11.2026)
- Ohne Grafikchip (Software-WebGL wie bei Messrobotern/PageSpeed, erkannt per WEBGL_debug_renderer_info) schlanker Ersatz statt 3D/Dauer-Animation; mit Grafikchip unverändert.
- Bei neuen Änderungen: Lighthouse mobil prüfen (Ziel: TBT unter 200 ms, CLS unter 0,1). Nicht die GPU-Erkennung entfernen.
