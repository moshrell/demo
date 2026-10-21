/* Wird inline in <head> eingesetzt (kein Warten auf eine JS-Datei bei schwachem Netz).
   Uhrzeit immer in Hannover (Europe/Berlin), nicht in der Zeitzone des Telefons.
   Tarif: Sa, So, Feiertag (Niedersachsen) = "we"; Mo–Fr 7–18 = "tag"; sonst "abend". */
(function () {
  var FIX = { '01-01': 'Neujahr', '05-01': 'Tag der Arbeit', '10-03': 'Tag der Deutschen Einheit', '10-31': 'Reformationstag', '12-25': '1. Weihnachtstag', '12-26': '2. Weihnachtstag' };
  var WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ostern(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  }
  function feiertag(y, mo, d) {
    var f = FIX[pad(mo) + '-' + pad(d)];
    if (f) return f;
    var diff = Math.round((Date.UTC(y, mo - 1, d) - ostern(y)) / 864e5);
    return { '-2': 'Karfreitag', '1': 'Ostermontag', '39': 'Christi Himmelfahrt', '50': 'Pfingstmontag' }[diff] || null;
  }
  function jetzt(now) {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(now || new Date()).forEach(function (x) { p[x.type] = x.value; });
    var y = +p.year, mo = +p.month, d = +p.day, h = +p.hour % 24, mi = +p.minute;
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    var ft = feiertag(y, mo, d);
    var tarif = ft || wd === 0 || wd === 6 ? 'we' : h >= 7 && h < 18 ? 'tag' : 'abend';
    return { wochentag: wd, wtKurz: WT[wd], stunde: h, minute: mi, feiertag: ft, tarif: tarif, uhr: pad(h) + ':' + pad(mi) };
  }
  function werkstatt(j, days, open, close) {
    var heute = !j.feiertag && days.indexOf(j.wochentag) > -1;
    if (heute && j.stunde >= open && j.stunde < close) return { offen: true, text: 'Werkstatt offen bis ' + close + ' Uhr' };
    if (heute && j.stunde < open) return { offen: false, text: 'Werkstatt öffnet heute ' + open + ' Uhr' };
    var w = j.wochentag;
    for (var i = 1; i <= 7; i++) { w = (w + 1) % 7; if (days.indexOf(w) > -1) break; }
    return { offen: false, text: 'Werkstatt zu, öffnet ' + (w === (j.wochentag + 1) % 7 ? 'morgen' : WT[w]) + ' ' + open + ' Uhr' };
  }
  function each(sel, fn) { var l = document.querySelectorAll(sel); for (var i = 0; i < l.length; i++) fn(l[i]); }
  // Füllt alle [data-live-*]-Stellen, die schon im DOM stehen. Mehrfach aufrufbar.
  function fill() {
    var A = window.AUF, j = jetzt(), t = null;
    for (var i = 0; i < A.T.length; i++) if (A.T[i].id === j.tarif) t = A.T[i];
    A.now = j; A.tarif = t;
    document.documentElement.setAttribute('data-tarif', j.tarif);
    each('[data-live-jetzt]', function (el) { el.textContent = 'Erreichbar · ' + j.wtKurz + ' ' + j.uhr + ' · ' + (j.tarif === 'abend' && j.stunde < 7 ? 'Nachttarif' : t.kurz) + (j.feiertag ? ' (' + j.feiertag + ')' : ''); });
    each('[data-live-zu]', function (el) { el.textContent = t.zugefallen + ' €'; });
    each('[data-live-ab]', function (el) { el.textContent = t.abgeschlossen + ' €'; });
    each('[data-tarif-row]', function (el) { var on = el.getAttribute('data-tarif-row') === j.tarif; el.classList.toggle('is-jetzt', on); if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current'); });
    var w = werkstatt(j, A.W.days, A.W.open, A.W.close);
    each('[data-werkstatt]', function (el) { el.textContent = w.text; });
    document.dispatchEvent(new CustomEvent('auf:tick'));
  }
  window.AUF = { jetzt: jetzt, werkstatt: werkstatt, feiertag: feiertag, fill: fill, T: [], W: { days: [], open: 0, close: 0 } };
})();
