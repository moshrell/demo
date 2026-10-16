# Demo: Architekturbüro (сайт архитектора)

Статус: **ТЗ и логика, кода ещё нет.** Тексты на немецком: `TEXTE.md` в этой же папке.
Фиктивное бюро: **Studio Wendt Architekten**, Hannover-List (всё вымышлено, в Impressum демо-данные).

## Цель сайта
Единственная цель: **запрос на Erstgespräch** (первичную консультацию). Клиент (Bauherr, частный застройщик) приходит из поиска ("Architekt Hannover Einfamilienhaus", "Sanierung Altbau Architekt", "Bauantrag Anbau") и боится трёх вещей: выбрать не того, вылететь за бюджет, потерять контроль. Каждый блок снимает один из страхов.

## Решения (зафиксировано)
- Слайдера До/После **нет**.
- Hero: SVG-чертёж дома прорисовывается линиями и **остаётся чертежом**. Фото после него не проявляются, фото живут в отдельных блоках ниже (Projekte, Büro).
- Дизайн: бумажно-белый фон, графит, тонкие линии-волосянки, один акцент (приглушённая терракота). Крупный серифный заголовок, моно-шрифт для цифр и фактов, асимметричная сетка. Mobile first.
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

## Логика пользователя (user flow)

### Три типа посетителя и их путь
| Кто | Что ищет | Путь по сайту | Конверсия |
|---|---|---|---|
| Строит дом с нуля | уверенность, что бюро ведёт процесс | Hero → Projekte (Neubau) → Ablauf → Kosten/Rechner → Anfrage | Erstgespräch |
| Покупает старый дом | оценка рисков и бюджета Sanierung | Hero → Leistungen (Umbau/Sanierung) → Projekt Altbau → Rechner → Anfrage | Erstgespräch |
| Нужен только Bauantrag (разрешение) | быстро, чётко, за понятные деньги | Hero → Leistungen (Bauantrag) → FAQ → Anfrage | Anfrage "nur Bauantrag" |

### Главная страница по блокам (порядок)
1. **Hero.** Заголовок, одна строка подзаголовка, кнопка "Erstgespräch anfragen", рядом "Anrufen". Чертёж рисуется на фоне.
2. **Leistungen.** 4 карточки: Neubau, Umbau & Sanierung, Anbau & Aufstockung, Bauantrag. У каждой: что входит, для кого, ориентир "ab ... " и ссылка "Honorar einschätzen" (ведёт в Rechner с предвыбранным типом).
3. **Projekte.** 4 кейса, карточка раскрывается: фото, факты в моно-шрифте (Fläche, Budgetklasse, Bauzeit, Besonderheit), 3 предложения истории "Ausgangslage → Lösung → Ergebnis".
4. **Ablauf.** Вертикальная линия с 5 шагами. У каждого шага: "Das bekommen Sie" и "Das brauche ich von Ihnen".
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
- **Placeholders-примеры** во всех полях: "Max Mustermann", "0511 1234567", "max@beispiel.de", "z. B. Gehrden, Hauptstraße".
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
- **Rundum** (Phasen 1–8: плюс Ausschreibung и Bauleitung, ведение стройки): 18–24 %

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
- [ ] **Разведка** (по правилам `D:\Webdesign`): посмотреть 3–4 реальных сайта архитекторов Hannover/Niedersachsen, записать что есть, чего нет, что раздражает на телефоне; при необходимости скорректировать структуру.
- [ ] Утвердить структуру и тексты, затем написать `PROMPTS.txt` для Gemini.
- [ ] Прогнать `hallmark`, выбрать тему, создать проект из `_template` и собрать скелет, потом дизайн и анимации.
- [ ] Включить GitHub Pages (Settings → Pages → Source: GitHub Actions).
