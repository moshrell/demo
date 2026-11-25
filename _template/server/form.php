<?php
declare(strict_types=1);

// Приёмник заявок для сайта клиента (шаблон Kravets Webdesign). Работает с OrderForm.astro (prop endpoint="form.php").
// Защита — в form-guard.php (мастер-копия: D:\Webdesign\_tools\form-guard). Здесь только настройки и письмо.
//
// Лежит в _template/server/, а не в public/: в демо приёмника нет. Для настоящего клиента скопировать
// server/form.php и server/form-guard.php в public/, заполнить блок НАСТРОЙКИ (всё с TODO), в OrderForm указать
// endpoint="form.php" и проверить отправку на хостинге клиента.

require __DIR__ . '/form-guard.php';

// ───────────── НАСТРОЙКИ ─────────────
const SITE_NAME = '__NAME__';                       // TODO: имя салона/магазина, как в письме
const SITE_HOST = 'TODO-domain.de';                 // TODO: домен сайта, без https://
const RECIPIENT_EMAIL = 'TODO@TODO-domain.de';      // TODO: куда приходят заявки
const FROM_EMAIL = 'formular@TODO-domain.de';       // TODO: ящик на домене хостинга, иначе письма уходят в спам (SPF)
const NOTE_LINKS = 'block';                          // 'block' — сообщение со ссылкой не принимается; 'defang' — ссылки обезвреживаются
const LIMIT_PER_HOUR = 5;                            // заявок с одного адреса
const LIMIT_PER_DAY = 20;
// ─────────────────────────────────────

const MIN_SECONDS_TO_FILL = 3;

// Не настроен — не отправляем ничего (защита от случайной публикации с TODO)
if (str_contains(RECIPIENT_EMAIL . FROM_EMAIL . SITE_HOST, 'TODO')) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Formular noch nicht eingerichtet.');
}
const MAX_LINE = 200;
const MAX_TEXT = 3000;
const MAX_SELECTION = 2000;

function respond(bool $ok, string $message, int $status = 200): never
{
    http_response_code($status);
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }
    // Без JS: простая страница без встроенных стилей (их не пропустит CSP сайта)
    header('Content-Type: text/html; charset=utf-8');
    $h = htmlspecialchars($ok ? 'Danke, Ihre Anfrage ist angekommen.' : 'Das hat leider nicht geklappt.', ENT_QUOTES, 'UTF-8');
    $m = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $back = htmlspecialchars(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')) . '/', ENT_QUOTES, 'UTF-8');
    echo "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        . "<meta name=\"robots\" content=\"noindex\"><title>{$h}</title></head><body><main><h1>{$h}</h1><p>{$m}</p>"
        . "<p><a href=\"{$back}\">Zurück zur Website</a></p></main></body></html>";
    exit;
}

$thanks = 'Vielen Dank! Wir melden uns so bald wie möglich bei Ihnen.';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !fgSameOrigin()) {
    respond(false, 'Ungültige Anfrage.', 405);
}
// Ловушка и метка времени: боту отвечаем «успехом», чтобы он не пробовал снова
if (trim((string) ($_POST['website'] ?? '')) !== '') {
    respond(true, $thanks);
}
$ts = (int) ($_POST['ts'] ?? 0);
if ($ts <= 0 || (time() - intdiv($ts, 1000)) < MIN_SECONDS_TO_FILL) {
    respond(true, $thanks);
}

$name = fgLine((string) ($_POST['name'] ?? ''), MAX_LINE);
$tel = fgLine((string) ($_POST['tel'] ?? ''), MAX_LINE);
$email = fgLine((string) ($_POST['email'] ?? ''), MAX_LINE);
$option = fgLine((string) ($_POST['option'] ?? ''), MAX_LINE);
$note = fgText((string) ($_POST['note'] ?? ''), MAX_TEXT);
$selection = fgText((string) ($_POST['auswahl'] ?? ''), MAX_SELECTION); // собирает OrderForm из выбранных позиций

if (mb_strlen($name) < 2 || strlen(preg_replace('/\D/', '', $tel) ?? '') < 6) {
    respond(false, 'Bitte geben Sie Ihren Namen und eine Telefonnummer an.', 422);
}
if (!preg_match('/^[0-9+\/\-\s()]{6,40}$/', $tel)) {
    respond(false, 'Bitte prüfen Sie die Telefonnummer, z. B. 0511 1234567.', 422);
}
$isEmail = $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
if ($email !== '' && !$isEmail) {
    respond(false, 'Bitte prüfen Sie die E-Mail-Adresse, z. B. name@beispiel.de.', 422);
}
if (($_POST['privacy'] ?? '') === '') {
    respond(false, 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.', 422);
}
// Ссылки: в имени, выборе и варианте их не бывает — это бот; в сообщении по настройке NOTE_LINKS
if (fgHasLink($name) || fgHasLink($option) || fgHasLink($selection)) {
    respond(false, 'Bitte ohne Links oder Internetadressen.', 422);
}
if (fgHasLink($note)) {
    if (NOTE_LINKS === 'block') {
        respond(false, 'Bitte ohne Links oder Internetadressen in der Nachricht.', 422);
    }
    if (fgCountLinks($note) > 2) {
        respond(true, $thanks); // ссылок много — спам
    }
}
if (!fgRateLimit('anfrage', LIMIT_PER_HOUR, LIMIT_PER_DAY)) {
    respond(false, 'Gerade kamen zu viele Anfragen von Ihrem Anschluss. Bitte versuchen Sie es später oder rufen Sie uns an.', 429);
}

// WhatsApp-ссылку для ответа строим сами (немецкий мобильный: 015…/016…/017… или +49 1…)
$digits = preg_replace('/\D/', '', $tel) ?? '';
$wa = '';
if (preg_match('/^(?:00491|491|01)([5-7]\d{8,10})$/', $digits, $m)) {
    $wa = 'https://wa.me/491' . $m[1];
}

$subject = mb_encode_mimeheader('Neue Anfrage über die Website: ' . $name, 'UTF-8', 'B', "\r\n");
$body = "Neue Anfrage über das Formular auf " . SITE_HOST . "\n\n"
    . "Name: {$name}\n"
    . "Telefon: {$tel}\n"
    . ($isEmail ? "E-Mail: {$email}\n" : '')
    . ($wa !== '' ? "Per WhatsApp antworten: {$wa}\n" : '')
    . ($option !== '' ? "\nAuswahl: {$option}\n" : '')
    . ($selection !== '' ? "\nBestellung (Angaben aus dem Formular, Preise bitte prüfen):\n{$selection}\n" : '')
    . ($note !== '' ? "\nNachricht:\n" . fgDefang($note) . "\n" : '')
    . "\n--\nDiese Nachricht kam über das Formular. Sie enthält keine Anhänge und keine anklickbaren Links des Absenders.\n"
    . "Einwilligung zum Datenschutz wurde vor dem Absenden erteilt.\n";

$headers = [
    'From: ' . mb_encode_mimeheader(SITE_NAME, 'UTF-8', 'B', "\r\n") . ' <' . FROM_EMAIL . '>',
    'Reply-To: ' . ($isEmail ? $email : RECIPIENT_EMAIL),
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
];

if (!mail(RECIPIENT_EMAIL, $subject, $body, implode("\r\n", $headers), '-f' . FROM_EMAIL)) {
    respond(false, 'Der Versand hat gerade nicht geklappt. Bitte rufen Sie uns an.', 500);
}
respond(true, $thanks);
