// Quersteher-Code: QS-<Zeit in Hundertstel>-<Prüfzeichen>. Nur Demo-Prüfung im Browser (nicht fälschungssicher);
// beim echten Kunden wäre die Prüfung serverseitig oder der Code ein fester, ausgedruckter Code.
const MIN = 2450, MAX = 9000;   // schneller als die Ideal-Runde (24,9 s) ist nicht möglich
function check(centis) {
  const h = (Math.imul(centis, 2654435761) ^ 0x5bd1e995) >>> 0;
  return (h % 1296).toString(36).toUpperCase().padStart(2, '0');
}
export function makeCode(seconds) {
  const c = Math.round(seconds * 100);
  return `QS-${c}-${check(c)}`;
}
export function parseCode(raw) {
  const m = /^QS-?(\d{4})-?([0-9A-Z]{2})$/.exec(String(raw || '').trim().toUpperCase().replace(/\s+/g, ''));
  if (!m) return null;
  const c = +m[1];
  if (c < MIN || c > MAX || check(c) !== m[2]) return null;
  return { centis: c, seconds: c / 100, code: `QS-${m[1]}-${m[2]}` };
}
