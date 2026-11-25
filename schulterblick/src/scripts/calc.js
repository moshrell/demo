// Rechenkern: gleicher Code im Build (Startwert im HTML) und im Browser (Live-Zähler).
// Alle Preise stehen in src/data/site.json (Musterwerte, TODO vom Kunden).

export const PAPIERE = ['sehtest', 'erstehilfe', 'foto', 'antrag'];

export function defaults(site) {
  return {
    alter: '18',
    getriebe: 'schaltung',
    sprache: 'de',
    papiere: { sehtest: true, erstehilfe: true, foto: true, antrag: true },
    fahrten: site.fahrten.default,
    lern: true,
    retryT: false,
    retryP: false,
  };
}

export function perFahrt(prices, s) {
  return prices.fahrstunde + (s.getriebe === 'automatik' ? prices.automatikAufpreis : 0);
}

export function perSonder(prices, s) {
  return prices.sonderfahrt + (s.getriebe === 'automatik' ? prices.automatikAufpreis : 0);
}

export function retryCosts(prices, s) {
  const t = prices.theorie.schule + prices.theorie.pruefer;
  const p = prices.praxis.schule + prices.praxis.pruefer + prices.auffrischung * perFahrt(prices, s);
  return { t, p };
}

// Liefert Positionen (id, Station, Betrag, Empfänger) und Summen.
export function calc(prices, s) {
  const fahrt = perFahrt(prices, s);
  const sonder = perSonder(prices, s);
  const nSonder = Object.values(prices.sonderAnzahl).reduce((a, b) => a + b, 0);
  const lines = [];
  const add = (id, stop, amount, to, vars = {}) => {
    if (amount > 0) lines.push({ id, stop, amount, to, vars });
  };
  add('grund', 1, prices.grundbetrag, 'school');
  for (const k of PAPIERE) if (s.papiere[k]) add(k, 2, prices.papiere[k], 'extern');
  if (s.lern) add('lern', 3, prices.lernpaket, 'school');
  add('fahrt', 4, s.fahrten * fahrt, 'school', { n: s.fahrten });
  add('sonder', 5, nSonder * sonder, 'school');
  add('theorie', 6, prices.theorie.schule, 'school');
  add('theorie_x', 6, prices.theorie.pruefer, 'extern');
  add('praxis', 6, prices.praxis.schule, 'school');
  add('praxis_x', 6, prices.praxis.pruefer, 'extern');
  if (s.retryT) {
    add('retry_t', 6, prices.theorie.schule, 'school');
    add('retry_t_x', 6, prices.theorie.pruefer, 'extern');
  }
  if (s.retryP) {
    add('retry_p', 6, prices.praxis.schule + prices.auffrischung * fahrt, 'school');
    add('retry_p_x', 6, prices.praxis.pruefer, 'extern');
  }
  const sum = (f) => lines.filter(f).reduce((a, l) => a + l.amount, 0);
  const perStop = {};
  for (let i = 1; i <= 7; i++) perStop[i] = sum((l) => l.stop === i);
  return {
    lines,
    total: sum(() => true),
    school: sum((l) => l.to === 'school'),
    extern: sum((l) => l.to === 'extern'),
    perStop,
    fahrt,
    sonder,
    nSonder,
  };
}

export function euro(n, lang = 'de') {
  const loc = { de: 'de-DE', en: 'en-IE', uk: 'uk-UA' }[lang] || 'de-DE';
  return new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
