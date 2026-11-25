// Schulterblick: Route, Zähler, Sprachen, Formular. Kein Tracking, keine Anfragen nach außen.
import site from '../data/site.json';
import i18n from '../data/i18n.json';
import { calc, defaults, euro, retryCosts, PAPIERE } from './calc.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LANGS = ['de', 'en', 'uk'];
const LANG_NAME = { de: 'Deutsch', en: 'English', uk: 'Українська' };
const KEY_STATE = 'sb:state';
const KEY_LANG = 'sb:lang';
const prices = site.prices;

const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus: egal */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* egal */ } },
};

/* ---------- Zustand ---------- */
const base = defaults(site);
const saved = store.get(KEY_STATE) || {};
const state = { ...base, ...saved, papiere: { ...base.papiere, ...(saved.papiere || {}) } };
state.fahrten = clamp(Number(state.fahrten) || base.fahrten, site.fahrten.min, site.fahrten.max);
let lang = LANGS.includes(store.get(KEY_LANG)) ? store.get(KEY_LANG) : 'de';
let quizResult = null;
let blangTouched = false;

/* ---------- Texte ---------- */
const t = (k, v) => {
  const e = i18n[k];
  const s = e ? (e[lang] ?? e.de) : k;
  return v ? s.replace(/\{(\w+)\}/g, (_, n) => (v[n] ?? '')) : s;
};
const fmt = (n) => euro(n, lang);
const varsOf = (el) => {
  const v = {};
  for (const [k, val] of Object.entries(el.dataset)) if (/^v[A-Z]/.test(k)) v[k[1].toLowerCase() + k.slice(2)] = val;
  return v;
};
const retext = (el) => { el.textContent = t(el.dataset.i, varsOf(el)); };

function applyLang() {
  document.documentElement.lang = lang;
  document.title = t('meta_title');
  $('meta[name="description"]')?.setAttribute('content', t('meta_desc'));
  $$('[data-i]').forEach((el) => {
    if (el.matches('[data-q-title], [data-getriebe-note]')) return;
    retext(el);
    if (el.classList.contains('consent__hint')) el.hidden = !el.textContent;
  });
  $$('[data-i-ph]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.iPh)));
  $$('[data-i-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.iAria)));
  $$('[data-i-alt]').forEach((el) => el.setAttribute('alt', t(el.dataset.iAlt)));
  $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  const sep = { de: '.', en: ',', uk: ' ' }[lang];
  $$('[data-odo-sep]').forEach((el) => { el.textContent = sep; });
  if (quizResult) $('[data-q-title]').textContent = t(quizResult === 'ok' ? 'q_ok' : 'q_no');
  reserveQuiz();
  if (!blangTouched) {
    const r = $(`input[name="blang"][value="${lang}"]`);
    if (r) r.checked = true;
  }
}

function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  lastTotal = -1;
  store.set(KEY_LANG, lang);
  applyLang();
  render();
  updateOpen();
}

/* ---------- Zähler ---------- */
function setOdo(value) {
  const s = String(Math.min(Math.round(value), 9999)).padStart(4, '0');
  const first = s.search(/[1-9]/);
  $$('[data-odo]').forEach((odo) => {
    $$('.odo__drum', odo).forEach((drum, i) => {
      drum.firstElementChild.style.setProperty('--d', s[i]);
      drum.classList.toggle('is-lead', first === -1 || i < first);
    });
  });
}

function rollIn() {
  const strips = $$('.odo__strip');
  if (reduce) return;
  strips.forEach((s) => { s.style.transition = 'none'; s.style.setProperty('--d', '0'); });
  void document.body.offsetWidth;
  strips.forEach((s) => { s.style.transition = ''; });
  setTimeout(() => render(), 350);
}

/* ---------- Rechnung ---------- */
function buildBeleg(r) {
  const frag = document.createDocumentFragment();
  const group = (to, key) => {
    const rows = r.lines.filter((l) => l.to === to);
    if (!rows.length) return;
    const g = document.createElement('div');
    g.className = 'beleg__g';
    const h = document.createElement('p');
    h.className = 'beleg__gh';
    h.textContent = t(key);
    g.append(h);
    rows.forEach((l) => {
      const row = document.createElement('p');
      row.className = 'beleg__l';
      const a = document.createElement('span');
      a.textContent = t('l_' + l.id, l.vars);
      const b = document.createElement('b');
      b.textContent = fmt(l.amount);
      row.append(a, b);
      g.append(row);
    });
    frag.append(g);
  };
  group('school', 'beleg_g_school');
  group('extern', 'beleg_g_extern');
  const tot = document.createElement('p');
  tot.className = 'beleg__total';
  const l1 = document.createElement('span');
  l1.textContent = t('beleg_total');
  const l2 = document.createElement('span');
  l2.textContent = fmt(r.total);
  tot.append(l1, l2);
  const split = document.createElement('p');
  split.className = 'beleg__split';
  split.textContent = t('beleg_split', { school: fmt(r.school) });
  const src = document.createElement('p');
  src.className = 'beleg__src';
  src.append(document.createTextNode(t('beleg_note') + ' '));
  const a = document.createElement('a');
  a.href = site.adacUrl;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = t('beleg_adac');
  src.append(a);
  frag.append(tot, split, src);
  return frag;
}

function planRows(r, extra = []) {
  const rows = [];
  rows.push([t('r_alter'), t(state.alter === '17' ? 's1_a17' : 's1_a18')]);
  rows.push([t('r_getriebe'), t(state.getriebe === 'automatik' ? 's1_auto' : 's1_schalt')]);
  rows.push([t('r_sprache'), LANG_NAME[state.sprache]]);
  rows.push([t('r_fahrten'), String(state.fahrten)]);
  rows.push([t('r_open'), `${PAPIERE.filter((k) => state.papiere[k]).length} / ${PAPIERE.length}`]);
  const buf = [state.retryT && t('r_theorie'), state.retryP && t('r_praxis')].filter(Boolean);
  rows.push([t('r_puffer'), buf.length ? buf.join(', ') : t('r_none')]);
  rows.push(...extra);
  rows.push([t('f_sum'), fmt(r.total), true]);
  return rows;
}

function fillDl(dl, rows) {
  dl.replaceChildren(...rows.map(([k, v, strong]) => {
    const d = document.createElement('div');
    if (strong) d.className = 'plan__sum';
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    d.append(dt, dd);
    return d;
  }));
}

/* ---------- Anzeige aktualisieren ---------- */
let liveTimer = 0;
let lastTotal = -1;
function render() {
  const r = calc(prices, state);
  const rc = retryCosts(prices, state);

  $$('[data-sum]').forEach((el) => { el.textContent = fmt(r.perStop[el.dataset.sum]); });
  setOdo(r.total);
  $$('[data-beleg]').forEach((box) => box.replaceChildren(buildBeleg(r)));

  const hours = new Intl.NumberFormat({ de: 'de-DE', en: 'en-IE', uk: 'uk-UA' }[lang], { maximumFractionDigits: 2 }).format(state.fahrten * 0.75);
  const val = $('[data-fahrten-val]');
  if (val) val.textContent = String(state.fahrten);
  const hEl = $('[data-hours]');
  if (hEl) { hEl.dataset.vN = String(state.fahrten); hEl.dataset.vH = hours; retext(hEl); }
  const pEl = $('[data-fahrt-price]');
  if (pEl) { pEl.dataset.vP = fmt(r.fahrt); retext(pEl); }
  const sEl = $('[data-sonder-each]');
  if (sEl) { sEl.dataset.vP = fmt(r.sonder); retext(sEl); }
  $$('[data-retry-price="T"]').forEach((el) => { el.textContent = fmt(rc.t); });
  $$('[data-retry-price="P"]').forEach((el) => { el.textContent = fmt(rc.p); });
  $$('[data-paper]').forEach((inp) => {
    const price = inp.closest('.sw').querySelector('.sw__price');
    price.textContent = fmt(prices.papiere[inp.dataset.paper]);
  });
  const lernPrice = $('[data-lern]')?.closest('.sw').querySelector('.sw__price');
  if (lernPrice) lernPrice.textContent = fmt(prices.lernpaket);

  const note = $('[data-getriebe-note]');
  if (note) {
    note.dataset.i = state.getriebe === 'automatik' ? 's1_note_auto' : 's1_note_schalt';
    note.textContent = t(note.dataset.i, { x: fmt(prices.automatikAufpreis) });
  }

  const rng = $('#fahrten');
  if (rng) {
    rng.value = String(state.fahrten);
    rng.style.setProperty('--fill', `${((state.fahrten - site.fahrten.min) / (site.fahrten.max - site.fahrten.min)) * 100}%`);
    $$('[data-rng] [data-step]').forEach((b) => {
      b.disabled = (Number(b.dataset.step) < 0 && state.fahrten <= site.fahrten.min) || (Number(b.dataset.step) > 0 && state.fahrten >= site.fahrten.max);
    });
  }

  const plan = $('[data-plan]');
  if (plan) fillDl(plan, planRows(r));

  if (r.total !== lastTotal) {
    lastTotal = r.total;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { const l = $('[data-live]'); if (l) l.textContent = t('sr_total', { x: fmt(r.total) }); }, 800);
  }
  updateBar();
  store.set(KEY_STATE, state);
}

/* ---------- Eingaben ---------- */
function restoreInputs() {
  const radio = (name, v) => { const el = $(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };
  radio('alter', state.alter);
  radio('getriebe', state.getriebe);
  radio('sprache', state.sprache);
  $$('[data-paper]').forEach((i) => { i.checked = !!state.papiere[i.dataset.paper]; });
  const lern = $('[data-lern]');
  if (lern) lern.checked = !!state.lern;
  $$('[data-retry]').forEach((i) => { i.checked = !!state['retry' + i.dataset.retry]; });
}

function bindInputs() {
  $$('input[name="alter"], input[name="getriebe"], input[name="sprache"]').forEach((i) => i.addEventListener('change', () => { if (i.checked) { state[i.name] = i.value; render(); } }));
  $$('[data-paper]').forEach((i) => i.addEventListener('change', () => { state.papiere[i.dataset.paper] = i.checked; render(); }));
  $('[data-lern]')?.addEventListener('change', (e) => { state.lern = e.target.checked; render(); });
  $$('[data-retry]').forEach((i) => i.addEventListener('change', () => { state['retry' + i.dataset.retry] = i.checked; render(); }));
  const rng = $('#fahrten');
  rng?.addEventListener('input', () => { state.fahrten = clamp(Number(rng.value), site.fahrten.min, site.fahrten.max); render(); });
  $$('[data-rng] [data-step]').forEach((b) => b.addEventListener('click', () => {
    state.fahrten = clamp(state.fahrten + Number(b.dataset.step), site.fahrten.min, site.fahrten.max);
    render();
  }));
  $$('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $$('input[name="blang"]').forEach((i) => i.addEventListener('change', () => { blangTouched = true; }));
}

/* ---------- Quiz ---------- */
let reserveQuiz = () => {};
function initQuiz() {
  const quiz = $('[data-quiz]');
  if (!quiz) return;
  const btns = $$('.quiz__opts button', quiz);
  const res = $('.quiz__res', quiz);
  const again = $('[data-q-again]', quiz);
  const slot = $('[data-q-slot]', quiz);
  // Platz für Ergebnis + „Nochmal“ vorab reservieren, damit beim Antworten nichts nach unten springt.
  reserveQuiz = () => {
    if (!slot) return;
    slot.style.minHeight = '';
    const rh = res.hidden, ah = again.hidden;
    res.hidden = false; again.hidden = false;
    const h = slot.offsetHeight;
    res.hidden = rh; again.hidden = ah;
    slot.style.minHeight = `${h}px`;
  };
  reserveQuiz();
  btns.forEach((b) => b.addEventListener('click', () => {
    const ok = b.dataset.ok === '1';
    btns.forEach((x) => { x.disabled = true; if (x.dataset.ok === '1') x.classList.add('is-right'); });
    if (!ok) b.classList.add('is-wrong');
    quizResult = ok ? 'ok' : 'no';
    $('[data-q-title]', quiz).textContent = t(ok ? 'q_ok' : 'q_no');
    res.hidden = false;
    again.hidden = false;
    again.focus({ preventScroll: true });
  }));
  again.addEventListener('click', () => {
    btns.forEach((x) => { x.disabled = false; x.classList.remove('is-right', 'is-wrong'); });
    res.hidden = true;
    again.hidden = true;
    quizResult = null;
    btns[0].focus({ preventScroll: true });
  });
}

/* ---------- Blatt (Handy) ---------- */
function initSheet() {
  const sheet = $('[data-sheet]');
  if (!sheet || typeof sheet.showModal !== 'function') return;
  $('[data-sheet-open]')?.addEventListener('click', () => sheet.showModal());
  $$('[data-sheet-close]').forEach((b) => b.addEventListener('click', () => sheet.close()));
  $('[data-sheet-cta]')?.addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
  matchMedia('(min-width: 960px)').addEventListener('change', (e) => { if (e.matches && sheet.open) sheet.close(); });
}

/* ---------- Büro offen? ---------- */
function updateOpen() {
  const el = $('[data-open-state]');
  if (!el) return;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const day = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];
  const now = Number(parts.hour) * 60 + Number(parts.minute);
  const mins = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const today = site.hours[day];
  let text;
  let open = false;
  if (today && now >= mins(today[0]) && now < mins(today[1])) {
    open = true;
    text = t('open_now', { t: today[1] });
  } else {
    for (let d = 0; d < 8; d++) {
      const dd = ((day - 1 + d) % 7) + 1;
      const h = site.hours[dd];
      if (!h || (d === 0 && now >= mins(h[0]))) continue;
      const loc = { de: 'de-DE', en: 'en-GB', uk: 'uk-UA' }[lang];
      const name = new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, dd)));
      text = t('closed_next', { d: name, t: h[0] });
      break;
    }
  }
  el.textContent = text || '';
  el.classList.toggle('is-open', open);
}

/* ---------- Formular ---------- */
function initForm() {
  const form = $('[data-form]');
  if (!form) return;
  const done = $('[data-done]');
  const list = $('[data-done-list]');
  const field = (n) => form.elements.namedItem(n);
  const err = (input, show) => {
    const e = document.getElementById(input.getAttribute('aria-describedby') || '');
    if (e) e.hidden = !show;
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
    input.closest('.check')?.classList.toggle('is-invalid', show);
  };
  ['name', 'tel', 'email'].forEach((n) => field(n).addEventListener('input', () => err(field(n), false)));
  field('privacy').addEventListener('change', () => err(field('privacy'), false));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = field('name'), tel = field('tel'), mail = field('email'), priv = field('privacy');
    const bad = [];
    const check = (i, ok) => { err(i, !ok); if (!ok) bad.push(i); };
    check(name, name.value.trim().length > 1);
    check(tel, tel.value.replace(/\D/g, '').length >= 6);
    check(mail, mail.value.trim() === '' || mail.checkValidity());
    check(priv, priv.checked);
    if (bad.length) { bad[0].focus(); return; }
    const r = calc(prices, state);
    const startKey = { call: 'f_start_call', probe: 'f_start_probe', buero: 'f_start_buero' }[form.elements.namedItem('start').value];
    const blang = $('input[name="blang"]:checked', form)?.value || lang;
    fillDl(list, [
      [t('r_start'), t(startKey)],
      [t('f_name'), name.value.trim()],
      [t('f_tel'), tel.value.trim()],
      [t('f_lang_h'), LANG_NAME[blang]],
      ...planRows(r),
    ]);
    form.hidden = true;
    done.hidden = false;
    done.focus();
    try { sessionStorage.removeItem(FORM_KEY); } catch { /* egal */ }
  });

  // Eingaben nie verlieren: Zwischenspeicher nur in diesem Tab. Das Einwilligungs-Häkchen wird nie gespeichert.
  const FORM_KEY = `form:${location.pathname}:anmeldung`;
  const fields = () => [...form.elements].filter((el) => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.name && el.name !== 'privacy');
  const save = () => {
    try {
      const d = {};
      fields().forEach((el) => { if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; } else d[el.name] = el.value; });
      sessionStorage.setItem(FORM_KEY, JSON.stringify({ ...d, _blangTouched: blangTouched }));
    } catch { /* egal */ }
  };
  try {
    const raw = sessionStorage.getItem(FORM_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      fields().forEach((el) => {
        if (!(el.name in d)) return;
        if (el.type === 'radio') el.checked = el.value === d[el.name]; else el.value = String(d[el.name]);
      });
      if (d._blangTouched) blangTouched = true;
    }
  } catch { /* egal */ }
  form.addEventListener('input', save);
  form.addEventListener('change', save);
}

/* ---------- Route mit Auto ---------- */
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (parent) parent.append(n);
  return n;
};
const octagon = (r) => Array.from({ length: 8 }, (_, k) => { const a = ((k * 45 + 22.5) * Math.PI) / 180; return `${(24 + r * Math.cos(a)).toFixed(1)},${(24 + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
const checker = () => {
  let s = '<rect x="2" y="2" width="44" height="44" rx="7" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/>';
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if ((i + j) % 2 === 0) s += `<rect x="${4 + i * 8}" y="${4 + j * 8}" width="8" height="8" class="pin__chk-a"/>`;
  return s;
};
const SHAPES = [
  null,
  { cls: 'circle', svg: '<circle cx="24" cy="24" r="22" class="pin__shape-paper"/><circle cx="24" cy="24" r="18.5" class="pin__shape-blue"/>' },
  { cls: 'square', svg: '<rect x="2" y="2" width="44" height="44" rx="8" class="pin__shape-paper"/><rect x="6" y="6" width="36" height="36" rx="5" class="pin__shape-blue"/>' },
  { cls: 'triangle', svg: '<polygon points="24,6 43,41 5,41" class="pin__shape-tri"/>' },
  { cls: 'diamond', svg: '<polygon points="24,1 47,24 24,47 1,24" class="pin__shape-paper"/><polygon points="24,6 42,24 24,42 6,24" class="pin__shape-yellow"/>' },
  { cls: 'ring', svg: '<circle cx="24" cy="24" r="19" class="pin__shape-ring"/>' },
  { cls: 'octagon', svg: `<polygon points="${octagon(23.5)}" class="pin__shape-paper"/><polygon points="${octagon(19.5)}" class="pin__shape-red"/>` },
  { cls: 'flag', svg: checker() },
];

function initRoute() {
  const root = $('[data-route]');
  const svg = $('[data-road]');
  if (!root || !svg) return;
  const stops = $$('[data-stop]', root);
  const hero = $('[data-hero]', root);

  const defs = el('defs', {}, svg);
  const clip = el('clipPath', { id: 'sb-done' }, defs);
  const clipRect = el('rect', { x: -40, y: 0, width: 400, height: 0 }, clip);
  const edge = el('path', { class: 'road__edge' }, svg);
  const ahead = el('path', { class: 'road__ahead' }, svg);
  const aheadDash = el('path', { class: 'road__ahead-dash' }, svg);
  const doneG = el('g', { 'clip-path': 'url(#sb-done)' }, svg);
  const done = el('path', { class: 'road__done' }, doneG);
  const doneDash = el('path', { class: 'road__done-dash' }, doneG);
  const car = el('g', { class: 'car' }, svg);
  car.innerHTML = `
    <g class="car__rot">
      <rect x="-7" y="-15" width="18" height="34" rx="6" class="car__shadow"/>
      <rect x="-9" y="-17" width="18" height="34" rx="6" class="car__body"/>
      <path d="M-6 4L-5 11L5 11L6 4Z" class="car__glass"/>
      <path d="M-5.5 -11L5.5 -11L5 -5L-5 -5Z" class="car__glass"/>
      <rect x="-4" y="-3" width="8" height="5.5" rx="1.5" class="car__sign"/>
      <rect x="-7.5" y="14.5" width="4" height="2" rx="1" class="car__head"/>
      <rect x="3.5" y="14.5" width="4" height="2" rx="1" class="car__head"/>
      <rect x="-7.5" y="-16" width="4" height="2" rx="1" class="car__tail"/>
      <rect x="3.5" y="-16" width="4" height="2" rx="1" class="car__tail"/>
      <circle cx="9.6" cy="13" r="1.7" class="car__ind car__ind--l"/>
      <circle cx="9.6" cy="-13" r="1.7" class="car__ind car__ind--l"/>
      <circle cx="-9.6" cy="13" r="1.7" class="car__ind car__ind--r"/>
      <circle cx="-9.6" cy="-13" r="1.7" class="car__ind car__ind--r"/>
    </g>`;

  const pins = stops.map((s) => {
    const n = Number(s.dataset.stop);
    const shape = SHAPES[n];
    const p = document.createElement('span');
    p.className = `pin pin--${shape.cls}`;
    p.setAttribute('aria-hidden', 'true');
    p.setAttribute('translate', 'no');
    p.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${shape.svg}</svg>${shape.cls === 'flag' ? '' : `<b>${n}</b>`}`;
    root.append(p);
    return p;
  });

  let geo = null;
  let laidOut = false;
  let target = 0;
  let cur = 0;
  let raf = 0;
  let moveTimer = 0;
  let currentStop = 0;

  function layout() {
    const cs = getComputedStyle(root);
    const gw = parseFloat(cs.getPropertyValue('--road-gutter')) || 56;
    const amp = parseFloat(cs.getPropertyValue('--road-amp')) || 9;
    const rw = parseFloat(cs.getPropertyValue('--road-width')) || 26;
    const pin = parseFloat(cs.getPropertyValue('--pin')) || 36;
    const rr = root.getBoundingClientRect();
    const H = root.offsetHeight;
    const rel = (e) => e.getBoundingClientRect().top - rr.top;
    const anchors = stops.map((s) => {
      const fin = $('.finish', s);
      if (fin) return rel(fin) + fin.offsetHeight / 2;
      return rel($('.stop__eyebrow', s)) + 12;
    });
    const xc = gw / 2;
    const y0 = rel($('.stop__eyebrow', hero)) + 10;
    const yEnd = anchors[anchors.length - 1] + pin * 0.9;
    const wl = Math.max(220, amp * 11);
    // Schlenker liegen auf einem festen Raster (absolute y), nicht relativ zu den Stationen:
    // wächst oder schrumpft Inhalt (Quiz, Übersetzung), bleibt der Straßenverlauf darüber unverändert.
    const pts = [{ x: xc, y: y0 }];
    const gap = wl * 0.38;
    let prev = y0;
    anchors.forEach((a) => {
      for (let k = Math.ceil((prev + gap) / wl); k * wl < a - gap; k++) {
        pts.push({ x: xc + (k % 2 ? 1 : -1) * amp, y: k * wl });
      }
      pts.push({ x: xc, y: a });
      prev = a;
    });
    pts.push({ x: xc, y: yEnd });
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], h = (q.y - p.y) / 2;
      d += ` C${p.x.toFixed(1)} ${(p.y + h).toFixed(1)} ${q.x.toFixed(1)} ${(q.y - h).toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    }
    svg.setAttribute('width', String(gw));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${gw} ${H}`);
    [edge, ahead, aheadDash, done, doneDash].forEach((p) => p.setAttribute('d', d));
    edge.setAttribute('stroke-width', String(rw + 5));
    ahead.setAttribute('stroke-width', String(rw));
    aheadDash.setAttribute('stroke-width', '2');
    done.setAttribute('stroke-width', String(rw));
    doneDash.setAttribute('stroke-width', '2.4');
    clipRect.setAttribute('width', String(gw + 80));
    pins.forEach((p, i) => { p.style.transform = `translate(${xc - pin / 2}px, ${anchors[i] - pin / 2}px)`; });
    const len = ahead.getTotalLength();
    const samples = [];
    const step = 12; // gröber abgetastet (schnell), dafür unten linear interpoliert: gleiche Genauigkeit
    for (let L = 0; L <= len + step; L += step) { const l = Math.min(L, len); samples.push([l, ahead.getPointAtLength(l).y]); }
    geo = { anchors, y0, yEnd, len, samples, scale: (rw * 0.64) / 18, rw };
    root.classList.add('is-ready');
    const first = !laidOut;
    laidOut = true;
    readScroll();
    // Erstes Layout: sofort. Spätere (Sprache, Übersetzung, Schrift): sanft nachfahren statt springen.
    if (first || reduce) cur = target;
    cur = clamp(cur, geo.y0 - 400, geo.yEnd + 400);
    place(cur);
    if (cur !== target && !raf) raf = requestAnimationFrame(frame);
  }

  const lengthAtY = (y) => {
    const s = geo.samples;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid][1] < y) lo = mid + 1; else hi = mid; }
    if (lo === 0) return s[0][0];
    const [l0, y0] = s[lo - 1], [l1, y1] = s[lo];
    return y1 === y0 ? l1 : l0 + ((y - y0) / (y1 - y0)) * (l1 - l0);
  };

  function place(y) {
    if (!geo) return;
    const yy = clamp(y, geo.y0, geo.yEnd);
    const L = lengthAtY(yy);
    const p = ahead.getPointAtLength(L);
    const a = ahead.getPointAtLength(Math.max(0, L - 3));
    const b = ahead.getPointAtLength(Math.min(geo.len, L + 3));
    const dx = b.x - a.x, dy = b.y - a.y;
    const rot = (Math.atan2(-dx, dy) * 180) / Math.PI;
    car.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${geo.scale.toFixed(3)})`);
    clipRect.setAttribute('height', p.y.toFixed(1));
    let passed = 0;
    pins.forEach((pin, i) => {
      const on = yy >= geo.anchors[i] - 2;
      pin.classList.toggle('is-passed', on);
      if (on) passed = i + 1;
    });
    const n = Math.max(1, passed);
    if (n !== currentStop) { currentStop = n; updateBar(); }
    if (!reduce) {
      const ahead2 = ahead.getPointAtLength(Math.min(geo.len, L + 28));
      const behind = ahead.getPointAtLength(Math.max(0, L - 4));
      const slope = (ahead2.x - behind.x) / Math.max(1, ahead2.y - behind.y);
      const turning = Math.abs(slope) > 0.09;
      car.classList.toggle('is-blink-l', turning && slope > 0);
      car.classList.toggle('is-blink-r', turning && slope < 0);
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => { car.classList.remove('is-blink-l', 'is-blink-r'); }, 600);
    }
  }

  function readScroll() {
    const top = root.getBoundingClientRect().top;
    target = innerHeight * 0.46 - top;
  }
  function frame() {
    const diff = target - cur;
    cur = reduce || Math.abs(diff) < 0.4 ? target : cur + diff * 0.2;
    place(cur);
    raf = cur === target ? 0 : requestAnimationFrame(frame);
  }
  function onScroll() {
    readScroll();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // Viele Auslöser (Schrift, Größenänderung, Quiz) kommen kurz hintereinander: zu einer Neuberechnung bündeln
  let pending = 0;
  const relayout = () => { clearTimeout(pending); pending = setTimeout(() => { pending = 0; layout(); }, 120); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { reserveQuiz(); relayout(); });
  new ResizeObserver(relayout).observe(root);
  document.fonts?.ready.then(() => { reserveQuiz(); relayout(); });
  layout();

  window.__route = { currentStop: () => currentStop };
}

function updateBar() {
  const m = $('[data-bar-meta]');
  if (m) m.textContent = t('bar_meta', { n: window.__route?.currentStop() || 1 });
}

/* ---------- Bilder ohne Datei ---------- */
function initImages() {
  $$('img').forEach((img) => {
    const mark = () => img.closest('.fig')?.classList.add('is-missing');
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) mark();
    img.addEventListener('error', mark);
  });
}

/* ---------- Start ---------- */
restoreInputs();
bindInputs();
initQuiz();
initSheet();
initForm();
initImages();
applyLang();
render();
updateOpen();
initRoute();
rollIn();
