Bay — линейный фильм «BMW-купе въезжает в гараж» (код, не фото)

Посмотреть (часть 1, 0–8 с)
  out/bay-part1.mp4        готовое видео 720x1280, 9:16
  index.html               живой предпросмотр: открыть двойным кликом в браузере
                           space пауза · ←/→ ±0,5 с · , . покадрово · [ ] по тактам · h скрыть панель
  out/sheet-part1.png      контактный лист (16 кадров)

Правила и план всего фильма: STYLE.md
Код: src/lib.js (инструменты), src/scene.js (вся сцена, функция времени)
Пересборка видео (нужен Node + playwright + ffmpeg):
  npm i
  node scripts/render.mjs check      числовые проверки
  node scripts/render.mjs video      видео в out/
  node scripts/render.mjs sheet      контактный лист
