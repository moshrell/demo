// Sprache DE/PT, Kaffee-Kompass, Fliesen-Karten, Öffnungsstatus. Alles ohne Cookies und ohne Speicher.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let lang = 'de';

const T = {
  de: {
    hint: 'Welcher Kaffee passt zu dir? Tippe, was du magst.',
    result: (n) => `Das passt am besten: ${n}`,
    like: (n) => `Wie ${n}`,
    twinDe: (x) => x.twin.de,
    almost: (n) => `Fast wie ${n}`,
    much: 'viel ', stronger: 'kräftiger', milder: 'milder',
    noMilk: 'ohne Milch', moreMilk: 'mit mehr Milch', muchMoreMilk: 'mit viel mehr Milch',
    lessMilk: 'mit weniger Milch', muchLessMilk: 'mit viel weniger Milch',
    days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    open: (to) => `Jetzt geöffnet, bis ${to} Uhr`,
    soon: (m) => `Schließt in ${m} Min.`,
    today: (from) => `Geschlossen. Öffnet heute um ${from} Uhr`,
    tomorrow: (from) => `Geschlossen. Öffnet morgen um ${from} Uhr`,
    later: (day, from) => `Geschlossen. Öffnet am ${day} um ${from} Uhr`,
  },
  pt: {
    hint: 'Que café é o teu? Toca no que gostas.',
    result: (n) => `O que melhor combina: ${n}`,
    like: (n) => `Como a ${n}`,
    twinPt: (x) => x.twin.pt,
    almost: (n) => `Quase como a ${n}`,
    much: 'bastante ', stronger: 'mais forte', milder: 'mais suave',
    noMilk: 'sem leite', moreMilk: 'com mais leite', muchMoreMilk: 'com bastante mais leite',
    lessMilk: 'com menos leite', muchLessMilk: 'com bastante menos leite',
    days: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
    open: (to) => `Aberto agora, até às ${to}`,
    soon: (m) => `Fecha dentro de ${m} min`,
    today: (from) => `Fechado. Abre hoje às ${from}`,
    tomorrow: (from) => `Fechado. Abre amanhã às ${from}`,
    later: (day, from) => `Fechado. Abre ${day} às ${from}`,
  },
};

/* ---------- Sprache ---------- */
const ptEls = $$('[data-pt]');
ptEls.forEach((el) => { el.dataset.de = el.textContent; });
$$('[data-pt-aria]').forEach((el) => { el.dataset.deAria = el.getAttribute('aria-label'); });

function setLang(next) {
  lang = next;
  document.documentElement.lang = next;
  ptEls.forEach((el) => { el.textContent = next === 'pt' ? el.dataset.pt : el.dataset.de; });
  $$('[data-pt-aria]').forEach((el) => el.setAttribute('aria-label', next === 'pt' ? el.dataset.ptAria : el.dataset.deAria));
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
  renderKompass();
  renderStatus();
}
$$('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

/* ---------- Kaffee-Wahl ----------
   Zwei Gruppen Knöpfe (Stärke, Milch). Jedes Getränk sitzt auf einem Punkt derselben Skala; gewählt wird das nächste.
   Ein Knopf allein reicht (die andere Achse zählt dann nicht). Nur ein Getränk wird hervorgehoben, nichts wird abgedunkelt;
   die anderen bekommen eine Zeile, wie sie sich vom Treffer unterscheiden. Neu berechnet wird nur bei einem Klick. */
const result = $('#k-result');
const reset = $('#k-reset');
const rows = $$('.drink');
const D = rows.map((el) => ({
  el, id: el.dataset.id, price: el.dataset.price, s: +el.dataset.strength, m: +el.dataset.milk,
  twin: el.dataset.twin ? { of: el.dataset.twin, de: el.dataset.twinDe, pt: el.dataset.twinPt } : null,
  name: $('.drink__name', el).textContent, hint: $('.drink__hint', el),
}));
const sel = { s: null, m: null };
const dock = $('#k-dock');
const dockText = $('#k-dock-text');
let seen = true;
let watched = null;
const io = new IntersectionObserver((e) => { seen = e[0].isIntersecting; showDock(); }, { threshold: 0.6, rootMargin: '-80px 0px 0px 0px' });
let bestNow = null;
function showDock() { dock.hidden = !bestNow || seen; }
$('#k-dock-btn').addEventListener('click', () => {
  if (!bestNow) return;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  bestNow.el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
});

// Milch zählt doppelt: wer „halb“ oder „viel“ wählt, bekommt kein Getränk mit anderer Milchmenge, die Stärke entscheidet dann innerhalb dieser Gruppe
const MILK_WEIGHT = 2;
function pick() {
  if (sel.s === null && sel.m === null) return null;
  return D.map((x, i) => ({ x, d: Math.hypot(sel.s === null ? 0 : x.s - sel.s, sel.m === null ? 0 : (x.m - sel.m) * MILK_WEIGHT) + i * 1e-4 }))
    .sort((a, b) => a.d - b.d)[0].x;
}

function compare(x, b) {
  const t = T[lang];
  if (x.twin && x.twin.of === b.id) return `${t.like(b.name)}, ${t[lang === 'pt' ? 'twinPt' : 'twinDe'](x)}`;
  const parts = [];
  const ds = x.s - b.s;
  if (ds >= 1.5) parts.push(t.much + t.stronger); else if (ds >= 0.75) parts.push(t.stronger);
  else if (ds <= -1.5) parts.push(t.much + t.milder); else if (ds <= -0.75) parts.push(t.milder);
  const dm = x.m - b.m;
  if (x.m === 0 && b.m > 0) parts.push(t.noMilk);
  else if (dm >= 1.5) parts.push(t.muchMoreMilk); else if (dm >= 0.75) parts.push(t.moreMilk);
  else if (dm <= -1.5) parts.push(t.muchLessMilk); else if (dm <= -0.75) parts.push(t.lessMilk);
  return parts.length ? parts.join(', ').replace(/^./, (c) => c.toUpperCase()) : t.almost(b.name);
}

function renderKompass() {
  const t = T[lang];
  const best = pick();
  $$('.opt').forEach((o) => o.setAttribute('aria-pressed', String(sel[o.dataset.axis] === +o.dataset.v)));
  reset.hidden = !best;
  D.forEach((x) => {
    x.el.classList.toggle('is-match', x === best);
    x.hint.textContent = best && x !== best ? compare(x, best) : '';
  });
  result.textContent = best ? t.result(best.name) : t.hint;
  bestNow = best;
  dockText.textContent = best ? `${t.result(best.name)} · ${best.price} €` : '';
  if (watched !== (best && best.el)) {
    if (watched) io.unobserve(watched);
    watched = best ? best.el : null;
    seen = true;
    if (watched) io.observe(watched);
  }
  showDock();
}

$$('.opt').forEach((o) => o.addEventListener('click', () => {
  const ax = o.dataset.axis;
  const v = +o.dataset.v;
  sel[ax] = sel[ax] === v ? null : v;
  renderKompass();
}));
reset.addEventListener('click', () => { sel.s = null; sel.m = null; renderKompass(); });

/* ---------- Karten umdrehen ---------- */
$$('.card').forEach((c) => c.addEventListener('click', () => {
  c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true'));
}));

/* ---------- Öffnungsstatus (Zeit in Berlin) ---------- */
const slots = new Map();
$$('.hours tr').forEach((tr) => {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  tr.dataset.days.split(',').forEach((d) => slots.set(+d, { from: toMin(tr.dataset.from), to: toMin(tr.dataset.to), fromT: tr.dataset.from, toT: tr.dataset.to, tr }));
});

function berlinNow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  return { dow, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

function renderStatus() {
  if (!slots.size) return;
  const { dow, min } = berlinNow();
  const t = T[lang];
  const today = slots.get(dow);
  let text;
  let open = false;
  if (today && min >= today.from && min < today.to) {
    open = true;
    const left = today.to - min;
    text = left <= 45 ? t.soon(left) : t.open(today.toT);
  } else if (today && min < today.from) {
    text = t.today(today.fromT);
  } else {
    for (let k = 1; k <= 7; k++) {
      const d = (dow + k) % 7;
      const s = slots.get(d);
      if (!s) continue;
      text = k === 1 ? t.tomorrow(s.fromT) : t.later(t.days[d], s.fromT);
      break;
    }
  }
  $$('[data-status]').forEach((el) => {
    el.classList.toggle('is-open', open);
    $('.status__text', el).textContent = text;
  });
  $$('.hours tr').forEach((tr) => {
    const on = tr.dataset.days.split(',').includes(String(dow));
    tr.classList.toggle('is-today', on);
    if (on) tr.setAttribute('aria-current', 'date'); else tr.removeAttribute('aria-current');
  });
}

// data-pt-Elemente des Status werden vom Skript gesetzt, nicht übersetzt
$$('[data-status] .status__text').forEach((el) => { const i = ptEls.indexOf(el); if (i > -1) ptEls.splice(i, 1); });

/* ---------- Navigation: aktueller Abschnitt + Nach-oben-Kachel ---------- */
const nav = $('.nav');
const navLinks = $$('.nav a');
const sections = navLinks.map((a) => $(a.hash)).filter(Boolean);
const toTop = $('.to-top');
let current = null;
let ticking = false;

function onScroll() {
  ticking = false;
  const line = window.innerHeight * 0.4;
  let id = null;
  sections.forEach((sec) => { if (sec.getBoundingClientRect().top <= line) id = sec.id; });
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) id = sections[sections.length - 1].id;
  if (id !== current) {
    current = id;
    navLinks.forEach((a) => {
      const on = a.hash === `#${id}`;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2 });
    });
  }
  toTop.classList.toggle('is-on', window.scrollY > window.innerHeight * 0.9);
}
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
toTop.addEventListener('click', () => {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
});
onScroll();

renderKompass();
renderStatus();
setInterval(renderStatus, 60000);
