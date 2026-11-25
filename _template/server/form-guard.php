<?php
declare(strict_types=1);

// form-guard: общая защита форм (Kravets Webdesign). Только функции, ничего не выводит.
// Мастер-копия: D:\Webdesign\_tools\form-guard\form-guard.php — в проектах лежит копия, правки вносить в мастер.
//
// Что закрывает:
//  - ссылки: fgHasLink() находит http(s)://, www., домены вида «name.de», «name[.]com», «t.me/…», IP-адреса;
//    поле можно запретить (fgHasLink → отказ) или обезвредить (fgDefang: hxxps://name[.]de, не кликается в почте);
//  - скрытые символы: управляющие, zero-width, смена направления текста (U+202E), битый UTF-8;
//  - частота: fgRateLimit() считает отправки по псевдониму IP (HMAC с ежедневно меняющимся ключом, IP не хранится);
//  - чужие сайты: fgSameOrigin() отклоняет POST, присланный со страницы другого домена.
// Ловушка для ботов (поле website) и метка времени (ts) остаются в самой форме.

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    http_response_code(404); // библиотеку нельзя вызвать напрямую
    exit;
}

mb_internal_encoding('UTF-8');

// Домены верхнего уровня, по которым ссылку узнаём и без http:// и www.
// Короткие «словесные» (z. B. «.de» после имени) — сознательно: ссылку вида «salon-xy.de» тоже ловим.
const FG_TLDS = 'de|com|net|org|info|biz|eu|at|ch|nl|be|fr|it|es|pl|cz|uk|us|ru|ua|by|kz|su|tr|cn|in|jp|io|co|me|ly|gl|gg|to|tv|cc|ws|tk|ml|ga|cf|gq'
    . '|xyz|top|online|site|website|shop|store|app|link|click|live|pro|club|vip|win|bid|work|space|tech|fun|icu|cyou|buzz|rest|bond|sbs|cfd|lol|life|world|today|news|page|dev|ai'
    . '|рф|укр|бел|срб|онлайн|сайт|рус';

/** Регулярка ссылки: со схемой, с www., голый домен с известным TLD (не часть e-mail), IPv4. */
function fgLinkPattern(): string
{
    static $re = null;
    if ($re !== null) {
        return $re;
    }
    // точка без пробелов, в том числе замаскированная: «name.de», «name[.]de», «name(dot)de»
    $dot = '(?:\.|\s*\[\s*\.?\s*\]\s*|\s*\(\s*\.?\s*\)\s*|\s*\[dot\]\s*|\s*\(dot\)\s*)';
    // «name . com» с пробелами — только для длинных TLD: иначе «Fr. De Vries», «Dr. Ai» или «Ende. Com» стали бы ссылкой (TLD строчными)
    $spaced = '\s+\.\s*|\s*\.\s+';
    $long = implode('|', array_filter(explode('|', FG_TLDS), static fn($t) => mb_strlen($t) >= 3));
    $label = '[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62})';
    return $re = '~(?:'
        . '\b(?:h[tx]{2}ps?|ftp)\s*:\s*/\s*/\S*'                                          // https://…, hxxp://…
        . '|\bwww' . $dot . '\S+'                                                           // www.…
        . '|(?<![@\w.-])' . $label . '(?:' . $dot . '[\p{L}\p{N}-]{1,63})*' . $dot . '(?:' . FG_TLDS . ')\b(?:/\S*)?' // name.de/…
        . '|(?<![@\w.-])' . $label . '(?:' . $spaced . ')(?-i:' . $long . ')\b'                // spam . com
        . '|\b\d{1,3}(?:\.\d{1,3}){3}\b'                                                    // 192.0.2.1
        . ')~iu';
}

function fgHasLink(string $value): bool
{
    return (bool) preg_match(fgLinkPattern(), $value);
}

function fgCountLinks(string $value): int
{
    return (int) preg_match_all(fgLinkPattern(), $value);
}

/** Обезвредить ссылки: схема → hxxp, точки → [.]. Текст остаётся читаемым, почта не делает его кликабельным. */
function fgDefang(string $value): string
{
    return (string) preg_replace_callback(fgLinkPattern(), static function (array $m): string {
        $s = preg_replace('~^h[tx]{2}p~i', 'hxxp', $m[0]) ?? $m[0];
        $s = preg_replace('~\s*:\s*/\s*/~', '://', $s) ?? $s;
        $s = str_replace('://', '[://]', $s);
        return preg_replace('~\.(?!\])~', '[.]', $s) ?? $s;
    }, $value);
}

/** Убрать битый UTF-8, управляющие и невидимые символы (zero-width, смена направления текста). */
function fgStrip(string $value, bool $multiline): string
{
    if (!mb_check_encoding($value, 'UTF-8')) {
        $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8'); // битые байты → «?»
    }
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    // \p{Cf}: U+200B…U+200F, U+202A…U+202E, U+2060…U+2064, U+FEFF и т. п.
    $value = preg_replace('/\p{Cf}+/u', '', $value) ?? '';
    $value = $multiline
        ? (preg_replace('/[^\P{Cc}\n\t]+/u', '', $value) ?? '')
        : (preg_replace('/\p{Cc}+/u', ' ', $value) ?? '');
    return $value;
}

/** Однострочное поле: без переводов строк (защита заголовков письма), пробелы схлопнуты, длина ограничена. */
function fgLine(string $value, int $max): string
{
    $value = fgStrip($value, false);
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    return mb_substr($value, 0, $max);
}

/** Многострочное поле: переводы строк сохраняются, больше двух пустых строк подряд не бывает. */
function fgText(string $value, int $max): string
{
    $value = fgStrip($value, true);
    $value = preg_replace("/[ \t]+\n/u", "\n", $value) ?? '';
    $value = preg_replace("/\n{3,}/u", "\n\n", $value) ?? '';
    return trim(mb_substr($value, 0, $max));
}

/** Запрос со страницы этого же сайта (или без Origin/Referer — так бывает при отправке без JS). */
function fgSameOrigin(): bool
{
    $host = strtolower(preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')) ?? '');
    foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $h) {
        $v = (string) ($_SERVER[$h] ?? '');
        if ($v === '' || $v === 'null') {
            continue;
        }
        $from = strtolower((string) parse_url($v, PHP_URL_HOST));
        return $from !== '' && ($from === $host || $from === 'www.' . $host || 'www.' . $from === $host);
    }
    return true;
}

function fgDataDir(): ?string
{
    static $dir = false;
    if ($dir !== false) {
        return $dir;
    }
    $candidates = [__DIR__ . '/_form-data', rtrim(sys_get_temp_dir(), '/\\') . '/fg-' . substr(sha1(__DIR__), 0, 10)];
    foreach ($candidates as $c) {
        if (!is_dir($c)) {
            @mkdir($c, 0700, true);
        }
        if (is_dir($c) && is_writable($c)) {
            if (!is_file($c . '/.htaccess')) {
                @file_put_contents($c . '/.htaccess', "Require all denied\nDeny from all\n");
                @file_put_contents($c . '/index.html', '');
            }
            return $dir = $c;
        }
    }
    return $dir = null;
}

/**
 * Лимит отправок с одного адреса: true = можно. IP не хранится: только HMAC с ключом, который
 * меняется каждый день; файлы старше двух дней удаляются. Если хранилище недоступно, форму не блокируем.
 */
function fgRateLimit(string $bucket, int $perHour, int $perDay): bool
{
    $dir = fgDataDir();
    if ($dir === null) {
        return true;
    }
    $keyFile = $dir . '/secret.key';
    $secret = @file_get_contents($keyFile);
    if (!is_string($secret) || strlen($secret) < 32) {
        $secret = bin2hex(random_bytes(32));
        @file_put_contents($keyFile, $secret, LOCK_EX);
        @chmod($keyFile, 0600);
    }
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0');
    $key = substr(hash_hmac('sha256', $ip, $secret . gmdate('Ymd')), 0, 24);
    $file = $dir . '/rl-' . preg_replace('/[^a-z0-9]/', '', strtolower($bucket)) . '-' . $key . '.json';

    // Уборка: изредка удаляем счётчики старше двух дней
    if (random_int(1, 50) === 1) {
        foreach ((array) glob($dir . '/rl-*.json') as $old) {
            if (is_string($old) && @filemtime($old) < time() - 2 * 86400) {
                @unlink($old);
            }
        }
    }

    $fp = @fopen($file, 'c+');
    if ($fp === false) {
        return true;
    }
    flock($fp, LOCK_EX);
    $raw = stream_get_contents($fp);
    $now = time();
    $times = is_string($raw) && $raw !== '' ? (json_decode($raw, true) ?: []) : [];
    $times = array_values(array_filter($times, static fn($t) => is_int($t) && $t > $now - 86400));
    $hour = array_filter($times, static fn($t) => $t > $now - 3600);
    $ok = count($times) < $perDay && count($hour) < $perHour;
    if ($ok) {
        $times[] = $now;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($times));
    flock($fp, LOCK_UN);
    fclose($fp);
    return $ok;
}
