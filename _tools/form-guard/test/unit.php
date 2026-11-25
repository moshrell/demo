<?php
require ($argv[1] ?? dirname(__DIR__)) . '/form-guard.php'; // php test/unit.php
$yes = ['https://spam.ru', 'Max www.spam.de', 'salon[.]de', 'kauf hier: bit.ly/x', 'HXXPS://evil.top/a', 't.me/kanal', 'besuch spam . com', 'IP 192.168.0.1 ok', 'casino (dot) xyz', 'ftp://a.b', 'шоп.рф'.'' , 'example.com'];
$no = ['Dr. med. Anna Müller', 'Salon Haarmonie GmbH & Co. KG', 'Bahnhofstr. 15, 30989 Gehrden', 'z. B. Schnitt, ca. 30 Min.', 'anna@salon.de', '0511 123 45 67', 'Termin am 24.11.2026 um 10.30', 'St. Pauli', 'Inh. Jörg', 'Kosten ca. 1.200 €', 'Stepan Kravets', 'Fr. De Vries', 'Dr. Ai Nguyen', 'Inh. De Luca', 'Das war’s. De facto gut', 'Hr. Me', 'Ende. Com und Co.'];
$fail = 0;
foreach ($yes as $t) { if (!fgHasLink($t)) { echo "MISS  $t\n"; $fail++; } }
foreach ($no as $t) { if (fgHasLink($t)) { echo "FALSE $t\n"; $fail++; } }
echo "defang: ", fgDefang("Meine Seite: https://salon-xy.de/alt und www.test.de, Mail anna@salon.de"), "\n";
echo "strip: [", fgLine("Max\u{202E}etsiL\u{200B} \r\nBcc: x@y.de\x07", 200), "]\n";
echo "text: [", str_replace("\n", '\n', fgText("a\r\n\r\n\r\n\r\nb\x00c\t d", 200)), "]\n";
echo "badutf8: [", fgLine("ab\xC3\x28cd", 50), "]\n";
echo $fail ? "UNIT FAIL $fail\n" : "UNIT OK\n";
