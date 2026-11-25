# Фото для «Tomás Ferreira» (Gemini)

Все файлы кладутся в папку **`src/photos/`** (то есть `D:\Webdesign\cafe-ferreira\src\photos\`).
Имя файла точно как ниже, расширение любое (jpg, jpeg, png, webp). Сайт сам сожмёт и нарежет под экраны.
Нет файла: на его месте плитка азулежу, ничего не ломается. Если после добавления файла картинка не появилась: остановить dev-сервер (Ctrl+C в окне START.bat) и запустить START.bat снова.

Первый кадр делай `hero-cafe`, остальные в том же чате Gemini с ним как референсом: плитка и дерево будут одинаковыми.

## STYLE (вставляется в каждый запрос)
```
Photorealistic editorial photography, natural window light, matte tones, fine film grain, shallow depth of field. Blue and white hand-painted azulejo tiles on the walls, dark wood, small Portuguese coffee bar in Germany. No text, no logos, no signage letters, no faces.
```

| Файл | Формат | Где на сайте | Запрос |
|---|---|---|---|
| `hero-cafe` | 4:5 вертикально (на ПК рамка 6×5, на телефоне 2:1: важное в центре) | первый экран, окно справа | `[STYLE] Interior of a small Portuguese coffee bar, walls fully covered in blue and white azulejo tiles, dark wood counter with a chrome espresso machine, a few small white cups on the counter, warm morning light from the left, no people, wide view.` |
| `bica` | 4:3 | карточка «Uma bica» | `[STYLE] Close-up of a small white espresso cup (bica) with a saucer on a marble counter, steam rising, blue azulejo tile wall softly out of focus behind.` |
| `galao` | 4:3 | карточка «Um galão» | `[STYLE] A tall glass of galão (Portuguese milky coffee) in a small metal holder on a tiled table, a paper sugar sachet beside it, blue and white tiles behind, soft window light.` |
| `pastel` | 4:3 | карточка «Dois pastéis de nata» | `[STYLE] Two pastéis de nata with a lightly caramelised top on a small white ceramic plate, a coffee cup beside them, dusting of cinnamon, blue tile background.` |
| `uebergabe` | 4:3 | карточка «Obrigado!» | `[STYLE] Hands only: a barista hand passing a small white espresso cup with a saucer across a dark wooden counter to a customer hand, blue azulejo tiles behind. No faces visible.` |
| `dazu-tisch` | 4:5 вертикально | блок «Dazu» | `[STYLE] A tosta mista (toasted ham and cheese sandwich) cut in half on a plate, a bica beside it, on a small round table with a blue and white tiled top, seen from slightly above, morning light.` |
| `owner` | 4:5 вертикально | блок «Tomás und die Fliesen» | `[STYLE] Portrait of a friendly Portuguese man in his mid 40s with short dark hair and a light stubble, wearing a dark barista apron over a white shirt, standing behind a wooden coffee counter, blue azulejo wall behind him, natural light from the side, relaxed half-smile, looking slightly past the camera.` |
| `tiles-detail` | 1:1 квадрат | блок «Tomás und die Fliesen», подпись «handbemalt» | `[STYLE] Macro of a single hand-painted blue and white azulejo tile with a floral pattern, slight glaze imperfections and tiny brush marks, neighbouring tiles visible at the edges, flat lay angle.` |

Итого 8 фото. Значки напитков в блоке «Die Karte» (`drink-bica`, `drink-cheirinho`, `drink-pingado`, `drink-abatanado`, `drink-meia`, `drink-galao`): промпты в `PROMPTS-GETRAENKE.txt`. Нет файла — рисуется значок из кода. На сайте указано, что заведение вымышленное и фото сгенерированы (плашка добавляется при сборке).
