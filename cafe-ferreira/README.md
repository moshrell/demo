# Tomás Ferreira (Café)

Astro-Projekt (Demo). Адрес на портфолио: `/vorschau/cafe/cafe-ferreira/`

    START.bat           # первый запуск ставит пакеты, дальше dev-сервер
    npm run build       # сборка + dist/.htaccess (CSP с хэшами, noindex)
    npm run publish     # сборка + копия в ..\kravets-site\public\vorschau\cafe\cafe-ferreira

Фото: `src/photos/`, список и промпты для Gemini в `PHOTOS.md`.
Тексты, цены, часы, напитки (слои чашки, сила, молоко): `src/data/cafe.json`.
Идея: имя хозяина собрано из плиток азулежу; меню с «компасом» (сила × молоко); переключатель DE/PT; статус «открыто» по времени Берлина.
