# Nuance

Astro-Projekt (Demo, Friseur «Zart»): Colour Atelier mit schwebenden 3D-Farbtropfen als Hintergrund.
Адрес на портфолио: `/vorschau/friseur/nuance/`

    START.bat           # первый запуск ставит пакеты, дальше dev-сервер
    npm run build       # сборка + dist/.htaccess (CSP с хэшами, noindex)
    npm run publish     # сборка + копия в ..\kravets-site\public\vorschau\friseur\nuance
    HERO-STUDIO.bat     # Remotion Studio: ролик с пятнами (папка hero)

Данные (тексты, цены, часы) — `src/data/site.json`. Страница — `src/pages/index.astro`.
Вымышленный бизнес, все адреса и цены придуманы; на странице есть плашка «Demo».

## Ролик с пятнами (`hero/`)
Remotion + three.js. Параметры (цвета, размер, скорость) — `hero/src/PaintHero.tsx`: `COLORS`, сетка `COLS × ROWS`,
`LOOP_FRAMES` (длина цикла; движение всегда целое число циклов, поэтому стык бесшовный). Сейчас 450 кадров = 15 с.

Финальный `public/paint.webm` собирается из PNG-кадров, а не напрямую: у прозрачных пикселей в WebM чёрный цвет,
и по краям сфер появляется тёмная кайма. Поэтому прозрачный фон заливаем кремовым цветом страницы:
1. в `hero`: `npx remotion render src/index.ts PaintHero frames --sequence --image-format=png`
2. пикселям с alpha = 0 поставить RGB = #faf6f1 (кремовый фон страницы)
3. `ffmpeg -framerate 30 -i fixed/%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p -crf 44 -b:v 0 -auto-alt-ref 0 paint.webm`

Safari не показывает прозрачный WebM: там остаётся статичный постер `paint-poster.webp`.

## Фото
Фото кладутся в `src/assets/img/` под именами из `GEMINI-PROMPTS.txt` (14 файлов: look-*, ba1/ba2-vorher/nachher, team-*, atelier). Пока файла нет, на сайте цветная карточка «Foto folgt»; после добавления файла она заменяется сама. Публиковать (`npm run publish`) лучше после того, как фото на месте.
