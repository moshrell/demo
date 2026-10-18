# Demo: Architekturbüro (сайт архитектора)

Статус: **сайт собран (Astro), фото подключены, ждёт ревью Степана; анимация чертежа — на согласовании (см. «К решению»).** Живая версия: https://moshrell.github.io/demo/architekt/. Тексты на немецком: `TEXTE.md`. Разведка по реальным сайтам: `RECON.md`.
Фиктивное бюро: **Hallbach Architekten**, Hannover-List (всё вымышлено, в Impressum демо-данные).

## Цель сайта
Единственная цель: **запрос на Erstgespräch** (первичную консультацию). Клиент (Bauherr, частный застройщик) приходит из поиска ("Architekt Hannover Einfamilienhaus", "Sanierung Altbau Architekt", "Bauantrag Anbau") и боится трёх вещей: выбрать не того, вылететь за бюджет, потерять контроль. Каждый блок снимает один из страхов.

## Решения (зафиксировано)
- Слайдера До/После **нет**.
- Hero: чертёж стоит **первым, над заголовком** (mobile first). План векторизован (potrace) из референса `plan-referenz.jpg` (Gemini, лежит у Степана в `D:\Webdesign\architekt\img\`), данные в `src/data/plan.json`. Линии рисуются, затем плавно переходят в фото того же дома сверху без крыши (`public/img/aerial-haus.jpg`, обрезано под тот же кадр 800×613, `mix-blend-mode: multiply`). Переключатель «Grundriss (план) / Foto» (aria-pressed), при reduced-motion и без JS сразу фото. Размерные линии 12,00 m / 7,80 m сгенерированы по границам плана.
- Дизайн: бумажно-белый фон, графит, один акцент (приглушённая терракота). Крупный серифный заголовок. Ритм: чередуются фон бумага / бумага-2 и разные вертикальные отступы (m/l); линии-волосянки только там, где они несут смысл (FAQ). Моно-шрифт только в 2 местах: подписи чертежа и цифры фактов проектов. Mobile first.
- Идеи в работе: (1) самочерчущийся чертёж, (3) Honorar-Orientierung (калькулятор ориентировочного гонорара), (4) Ablauf-линия, прорисовывающаяся при скролле. Лёгкая добавка: честная фраза в Büro ("Was ich nicht mache").
- Идея "День/Вечер" **не берём**, чтобы не плодить кадры.

## Технически (стек Степана: Astro, из `_template`)
- Проект собирается из `_template` (Astro, данные в `src/data/*.json`, шрифты локально через `@fontsource*`, без CDN и трекеров). Вёрстка mobile first (360–390 px), затем ПК.
- Страницы: `index`, `impressum`, `datenschutz`. Проекты открываются **раскрывающимися карточками на той же странице** (меньше риска и быстрее).
- Ссылки и ресурсы через `import.meta.env.BASE_URL` (работает в подпапке GitHub Pages и на основном сайте).
- Анимации только `transform`/`opacity`/`stroke-dashoffset`, уважают `prefers-reduced-motion`. Чертёж и калькулятор должны работать и без анимаций.
- Фото: `public/img/`, WebP/JPG, `loading="lazy"`, заданные `width/height` (без прыжков вёрстки).
- Разметка schema.org (`Architect`/`LocalBusiness`) в JSON-LD.
- Просмотр с телефона: GitHub Pages, `https://moshrell.github.io/demo/architekt/` (workflow в `.github/workflows/pages.yml`, нужен один клик в Settings → Pages → Source: GitHub Actions).
- Дизайн: перед кодом прогнать скилл `hallmark` (оригинал на ПК: `D:\Webdesign\.claude\skills\hallmark`, в репозитории его нет), токены цвета/шрифта лежат в `global.css`.

## Дизайн (hallmark, зафиксировано)
- Допущения (Степан делегировал): аудитория = частные застройщики региона Hannover; действие = запрос Erstgespräch; тон = austere (сдержанный).
- Жанр: editorial. Макроструктура: **Map / Diagram** (Grundriss как hero-композиция, ниже документ). Тема: custom, «Bauplan, Transparentpapier, Graphit, Terrakotta» (бумага oklch 97.5% 0.008 85, акцент oklch 50% 0.135 40, контраст акцент/бумага 5.9:1).
- Шрифты (локально, @fontsource): Newsreader (заголовки, roman), IBM Plex Sans (текст), IBM Plex Mono (цифры, факты).
- Nav: wordmark слева, справа телефон (с 48rem) и «Menü» (`<details>`, на ПК список в 3 колонки); без строки ссылок и без линии (hallmark N9). Снизу липкая панель «Anrufen / Erstgespräch» (на телефоне, скрывается в блоках Honorar и Kontakt). Футер: Mast-headed (Ft1).
- Токены: `src/styles/tokens.css`. Данные: `src/data/*.json`. Формулы калькулятора: `src/data/rechner.json` + `src/scripts/calc.ts`.
- Форма: `src/components/AnfrageForm.astro` (производная от `_template/OrderForm.astro`: тот же стандарт, плюс select и связь с калькулятором).
- Фото: `public/img/` (9 шт., сжаты до ≤215 КБ; оригиналы у Степана в `D:\Webdesign\architekt\img\`). Имена из `PROMPTS.txt`, width/height реальные.

## Проверено (headless, без скриншотов)
Ширины 320/375/390/414/768/1280: нет горизонтального скролла, нет ошибок консоли и битых ресурсов; формулы калькулятора (все 4 типа, границы 20–600 м²); форма: валидация, автосохранение после перезагрузки, согласие не восстанавливается, Datenschutz в новой вкладке не стирает данные; prefers-reduced-motion и отключённый JS; все внутренние ссылки и якоря под base-путём; JSON-LD валиден.

## Публикация в портфолио
- Демо собрано с base `/vorschau/dienstleistung/architekt/`, лежит в `D:\Webdesign\kravets-site\public\vorschau\dienstleistung\architekt\`, превью `public\works\architekt.webp` (скриншот hero 1280×800), в `src/config/works.ts` вкладка «Architekten» (категория `dienstleistung`). Коммит в kravets-site есть, **push делает Степан** (`D:\Webdesign\PUSH-SITE.bat`).
- Исходники проекта живут в репозитории moshrell/demo (папка `architekt/`), на ПК в `D:\Webdesign\architekt\` только фото (`img\`). После любой правки сайта: пересобрать (`npm run build` в облаке), заново залить dist в kravets-site и обновить превью.

## К решению Степана
- «Ablauf как история дома» отменено (на телефоне нет места).

## Известные недочёты
- Фото и чертёж Gemini не идентичны в деталях (кухонная стойка в гостиной только на фото, дверные дуги), стены на фото тоньше; контуры и окна совпадают, при кроссфейде это не заметно. Вёрстка глазами не проверялась (Степан присылает замечания сам).
- Формы ничего не отправляют (демо). Для живого клиента нужен backend/почтовый сервис и правка Datenschutz.
- Значения калькулятора демонстрационные; перед показом настоящему архитектору сверить с HOAI и ценами региона.
- Проценты и цены в калькуляторе и «Besonderheit» у проектов вымышлены.

## Логика пользователя (user flow)

### Три типа посетителя и их путь
| Кто | Что ищет | Путь по сайту | Конверсия |
|---|---|---|---|
| Строит дом с нуля | уверенность, что бюро ведёт процесс | Hero → Projekte (Neubau) → Ablauf → Kosten/Rechner → Anfrage | Erstgespräch |
| Покупает старый дом | оценка рисков и бюджета Sanierung | Hero → Leistungen (Umbau/Sanierung) → Projekt Altbau → Rechner → Anfrage | Erstgespräch |
| Нужен только Bauantrag (разрешение) | быстро, чётко, за понятные деньги | Hero → Leistungen (Bauantrag) → FAQ → Anfrage | Anfrage "nur Bauantrag" |

### Главная страница по блокам (порядок)
1. **Hero.** Заголовок, одна строка подзаголовка, кнопка "Erstgespräch anfragen", рядом "Anrufen". Чертёж рисуется на фоне.
2. **Leistungen.** Слева заголовок, одна кнопка «Honorar einschätzen» (в Rechner), справа 4 услуги 2×2 без линий и ссылок в каждой строке.
3. **Projekte.** 4 кейса, фото сразу видно: первый на всю ширину (на телефоне до края), остальные три на телефоне листаются свайпом (scroll-snap, следующее фото выглядывает), на ПК в ряд.
3a. **Zahlen.** Тёмная полоса: 4 крупных числа из проектов (168 m², 1912, 28 m², 64 m²), каждое ведёт к проекту. Числа демонстрационные, как и проекты. «Zahlen und Verlauf» раскрывается: факты (Fläche, Budget, Bauzeit, Besonderheit), история, второе фото.
4. **Ablauf.** Вертикальная линия с 5 шагами (отрезок к следующему шагу прорисовывается, когда появляется сам следующий шаг). У каждого шага: "Das bekommen Sie" и "Das brauche ich von Ihnen".
5. **Honorar-Orientierung (Rechner).** Тип → площадь → уровень стоимости → объём услуг. Внизу **постоянно виден итог "ca. X – Y €"** (пересчёт на лету). Кнопка "Mit diesen Angaben anfragen" переносит выбор в форму.
6. **Büro.** Фото архитектора, короткая позиция, честная фраза, регистрация в Architektenkammer.
7. **FAQ.** 7 вопросов, снимают страхи (стоимость, сроки, Bauantrag, Bauleitung).
8. **Kontakt.** Форма + телефон + адрес + часы приёма.
9. **Футер.** Impressum, Datenschutz.

### Мобильная навигация
- Липкая нижняя панель: слева "Anrufen" (tel:), справа "Erstgespräch". Всегда в зоне большого пальца.
- Верхнее меню: бургер с 5 пунктами якорей.

### Форма запроса (Kontakt)
Поля: Name, Telefon, E-Mail (необязательно), Projektart (select, предзаполняется из Rechner), Ort des Grundstücks/Objekts, Nachricht (необязательно), чекбокс согласия.
- **Placeholders-примеры** во всех полях: "Max Mustermann", "030 23125 123", "max@example.com", "z. B. Gehrden, Hauptstraße".
- Так как собирается телефон, обязательны: **чекбокс Einwilligung** (согласие на обработку данных) со ссылкой на Datenschutz + краткая Datenschutz-Hinweis-строка под кнопкой.
- **Данные формы не теряются**: используем готовый блок `_template/src/components/OrderForm.astro` (sessionStorage-автосохранение уже встроено); ссылки на Datenschutz и Impressum открываются в **новой вкладке** (`target="_blank" rel="noopener"`), согласие не восстанавливается. Выбор в Rechner тоже сохраняется.
- Демо: отправка показывает экран "Danke, wir melden uns" без реального бэкенда (в README клиента пометить: нужен Formular-Backend, например Formspree или собственный).
- После отправки: подтверждение + что будет дальше ("Antwort in 1 Werktag").

### Rechner: формулы (индикативные, для демо)
Honorar ≈ Baukosten × процент услуг. Всегда пометка: "unverbindliche Orientierung (необязательная ориентировочная оценка), kein Angebot, tatsächliches Honorar nach HOAI und Gespräch".

Baukosten = Fläche (m²) × €/m² по типу и уровню:

| Тип | einfach | mittel | gehoben |
|---|---|---|---|
| Neubau | 2.600 | 3.200 | 4.000 |
| Umbau/Sanierung | 1.600 | 2.200 | 3.000 |
| Anbau/Aufstockung | 2.400 | 3.000 | 3.800 |
| Bauantrag (nur Genehmigung) | считается как Neubau/Umbau по типу объекта, объём услуг фиксируется на "Genehmigung" |

Процент от Baukosten по объёму:
- **Genehmigung** (Leistungsphasen 1–4: Planung bis Bauantrag): 8–11 %
- **Planung komplett** (Phasen 1–5: плюс Ausführungsplanung, рабочие чертежи): 13–17 %
- **Rundum** (Phasen 1–8: плюс Ausschreibung и Bauleitung, ведение стройки): 16–21 %

Для Umbau/Sanierung добавляется +2 процентных пункта к обеим границам (Bestand сложнее). Диапазон "от-до" = Baukosten × нижний/верхний процент, округление до 500 €. Рядом показывается и расчётный ориентир Baukosten. Минимальная площадь 20 m², максимум 600 m² (ползунок + число).

**Важно:** значения процентов и €/m² — демонстрационные ориентиры. Перед показом реальному архитектору сверить с актуальной HOAI и ценами региона.

### Бюро: честная фраза
"Was ich nicht mache: Pläne, die Ihr Budget ignorieren." (расшифровка в TEXTE.md)

## Юридический минимум
- **Impressum** (выходные данные): Name, Anschrift, Kontakt, Berufsbezeichnung "Architekt" и страна присвоения, **Architektenkammer Niedersachsen** (Kammer, номер в палате), **Berufshaftpflichtversicherung** (страхование проф. ответственности: страховщик и территория действия), USt-IdNr. В демо — явно вымышленные данные и пометка "Demo".
- **Datenschutz** (защита данных): сбор данных формой, хостинг, логи, права пользователя, без трекеров (без Google Analytics/внешних шрифтов), отдельная строка про Anfrage per Telefon/E-Mail.
- Согласие в форме, без предзаполненной галочки.
- Cookie-баннер **не нужен**, пока нет трекеров и внешних ресурсов (это сознательное решение; зафиксировать в Datenschutz).

## Фото (будущие промпты для Gemini, .txt)
Нужно около 8–10 кадров. Промпты писать только после утверждения структуры. Список кадров:
1. Hero-фон (необязательно, чертёж достаточен) — пропускаем.
2–5. По одному кадру на 4 проекта (экстерьер, 16:9 или 4:3).
6–7. Два интерьерных кадра для проектов Sanierung и Anbau (4:3).
8. Портрет архитектора (3:4).
9. Рабочий стол с чертежами (4:3) для Büro.
10. Фото для блока Ablauf (1:1), необязательно.
Все кадры в одном чате Gemini, единый свет и стиль, имена файлов по списку.

## Что ещё нужно сделать
- [x] Свои скиллы и `_template` перенесены в репозиторий; hallmark остаётся только на ПК.
- [x] Разведка сделана (`RECON.md`): в ТЗ добавлены Kaufberatung, Förderung (FAQ) и Offene Sprechstunde.
- [x] `PROMPTS.txt` для Gemini готов (9 кадров). Степан генерирует и кладёт файлы в `D:\Webdesign\architekt\img\`, Claude забирает их оттуда в `architekt/public/img/`.
- [ ] Утвердить структуру и тексты.
- [x] Hallmark пройден, проект собран из `_template`.
- [ ] Фото от Степана в `D:\\Webdesign\\architekt\\img\\`, затем Claude переносит их в `architekt/public/img/` и коммитит.
- [ ] Включить GitHub Pages (Settings → Pages → Source: GitHub Actions).
