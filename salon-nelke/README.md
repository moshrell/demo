# Salon Nelke — демо-сайт №2 (парикмахерская), концепция «Schaufenster»

Сайт как витрина магазина: навес-маркиза, вывеска «Открыто» (по реальному времени), в витрине фигура,
которую посетитель «стрижёт» сам (конструктор: причёска, цвет, борода). Выбор уходит в форму записи.
Без фото: всё нарисовано в SVG (src/components/Face.astro), поэтому нет проблем с правами на снимки.

    npm install
    npm run dev        # http://localhost:4321/vorschau/friseur/salon-nelke/
    npm run publish    # сборка + копия в ..\kravets-site\public\vorschau\friseur\salon-nelke

Тексты, цены, часы, «образы» — src/data/site.json. Новая причёска: добавить <g class="hg h-имя"> в Face.astro
и правило display в его style.
