// Seitenlogik: Box-Konfigurator, Öffnungsstatus, Firmen-Rechner. Keine Cookies, kein Speicher, keine Anfragen.
import shop from '../data/shop.json';
import { PIECES } from '../lib/pieces';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const byId = Object.fromEntries(shop.varieties.map((v) => [v.id, v]));
const sizes = Object.fromEntries(shop.sizes.map((s) => [s.id, s]));
const plain = (t) => t.replace(/\u00a0/g, ' ');
const wa = (text) => `https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(plain(text))}`;

const mail = (subject, text) => `mailto:${shop.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plain(text).replace(/\n/g, '\r\n'))}`;

/* ---------- Öffnungsstatus (Berliner Zeit) ---------- */
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hourLabel = (t) => `${parseInt(t, 10)} Uhr`;
function berlinNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { day: DAYS[parts.weekday], min: Number(parts.hour) * 60 + Number(parts.minute) };
}
function updateStatus() {
  const { day, min } = berlinNow();
  const today = shop.hours.schedule.find((h) => h.days.includes(day));
  let text;
  let open = false;
  if (today && min >= toMin(today.from) && min < toMin(today.to)) {
    open = true;
    text = `Jetzt geöffnet bis ${hourLabel(today.to)}`;
  } else if (today && min < toMin(today.from)) {
    text = `Heute ab ${hourLabel(today.from)} geöffnet`;
  } else {
    const next = shop.hours.schedule.find((h) => h.days.includes((day + 1) % 7));
    text = next ? `Geschlossen, morgen ab ${hourLabel(next.from)}` : 'Geschlossen';
  }
  $$('[data-status]').forEach((el) => {
    el.textContent = text;
    el.classList.toggle('is-open', open);
  });
}
updateStatus();
setInterval(updateStatus, 60000);

/* ---------- Box-Konfigurator ---------- */
// Zustand: Größe (automatisch oder von Hand), Stücke in Reihenfolge des Hinzufügens, Verpackung.
const grid = $('#tray-grid');
const live = $('#box-live');
const state = { size: 'm', manual: false, items: [], wrap: false, newIndex: -1 };
const MIN_AUTO = 'm'; // ohne eigene Wahl startet die Box als Familienbox (12)
const cap = () => sizes[state.size].slots;
const subtotal = () => state.items.reduce((s, id) => s + byId[id].price, 0);
const sum = () => subtotal() + (state.wrap ? shop.gift.wrapPrice : 0);
const counts = () => { const c = {}; state.items.forEach((id) => (c[id] = (c[id] || 0) + 1)); return c; };
const say = (msg) => { live.textContent = ''; setTimeout(() => (live.textContent = msg), 30); };
const hint = (msg) => { $('#box-hint').textContent = msg; };
const orderHint = (msg) => { $('#order-hint').textContent = msg; };

// Automatische Größe: die kleinste Box, in die alles passt (mindestens Familienbox)
function fit() {
  if (state.manual) return;
  const need = Math.max(state.items.length, sizes[MIN_AUTO].slots);
  state.size = shop.sizes.find((s) => s.slots >= need).id;
}

function orderText() {
  const sz = sizes[state.size];
  const c = counts();
  const lines = shop.varieties.filter((v) => c[v.id]).map((v) => `- ${c[v.id]}x ${v.name}`);
  const date = $('#box-date').value;
  const name = $('#box-name').value.trim();
  const phone = $('#box-phone').value.trim();
  const note = $('#box-note').value.trim();
  const msg = [
    `Hallo ${shop.name}, ich möchte eine Box vorbestellen:`,
    `${sz.label} (Platz für ${sz.slots}), gewählt: ${state.items.length} Stück`,
    ...lines,
    state.wrap ? 'Mit Geschenkverpackung' : '',
    `Summe: ${eur.format(sum())}`,
    date ? `Abholung: ${new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}` : '',
    name ? `Name: ${name}` : '',
    phone ? `Telefon: ${phone}` : '',
    note ? `Hinweis: ${note}` : '',
  ].filter(Boolean).join('\n');
  return msg;
}
function setOrderLinks() {
  const send = $('#box-send');
  const mailA = $('#box-mail');
  const empty = state.items.length === 0;
  [send, mailA].forEach((a) => a.setAttribute('aria-disabled', empty ? 'true' : 'false'));
  if (empty) {
    [send, mailA].forEach((a) => { a.href = '#sorten'; a.removeAttribute('target'); a.removeAttribute('rel'); });
    return;
  }
  const t = orderText();
  send.href = wa(t); send.target = '_blank'; send.rel = 'noopener';
  mailA.href = mail(`Vorbestellung ${shop.name}`, t);
}

// Pflichtangaben: Name und Einwilligung. Ohne beides öffnet sich keine Nachricht.
const setErr = (input, errId, show) => {
  const e = $(errId);
  e.hidden = !show;
  input.setAttribute('aria-invalid', show ? 'true' : 'false');
  const wrap = input.closest('.check');
  if (wrap) wrap.classList.toggle('is-invalid', show);
};
function checkOrder() {
  const name = $('#box-name');
  const consent = $('#box-consent');
  const nameBad = name.value.trim() === '';
  const consentBad = !consent.checked;
  setErr(name, '#err-name', nameBad);
  setErr(consent, '#err-consent', consentBad);
  if (nameBad) { name.focus(); return false; }
  if (consentBad) { consent.focus(); return false; }
  return true;
}
$$('[data-order]').forEach((a) => a.addEventListener('click', (e) => {
  if (state.items.length === 0) { e.preventDefault(); orderHint('Wähle zuerst mindestens ein Stück bei den Sorten.'); say('Wähle zuerst mindestens ein Stück bei den Sorten.'); return; }
  if (!checkOrder()) { e.preventDefault(); orderHint(''); return; }
  clearForm();
  orderHint(`Nachricht vorbereitet: ${state.items.length} Stück, Summe ${eur.format(sum())}. Abgeschickt wird sie erst in deiner App. Demo: nichts wurde gesendet oder gespeichert.`);
}));
$('#box-name').addEventListener('input', (e) => { if (e.target.value.trim()) setErr(e.target, '#err-name', false); });
$('#box-consent').addEventListener('change', (e) => { if (e.target.checked) setErr(e.target, '#err-consent', false); });

function renderReceipt() {
  const box = $('#receipt');
  const c = counts();
  const row = (l, r, cls = '') => { const d = document.createElement('div'); d.className = `receipt__row ${cls}`.trim(); const a = document.createElement('span'); a.textContent = l; const b = document.createElement('span'); b.textContent = r; d.append(a, b); return d; };
  if (!state.items.length) {
    const e = document.createElement('p');
    e.className = 'receipt__empty';
    e.textContent = 'Noch keine Stücke gewählt. Such dir oben Sorten aus.';
    box.replaceChildren(e);
    return;
  }
  const rows = shop.varieties.filter((v) => c[v.id]).map((v) => row(`${c[v.id]} × ${v.short}`, eur.format(c[v.id] * v.price)));
  if (state.wrap) rows.push(row('Geschenkverpackung', eur.format(shop.gift.wrapPrice)));
  rows.push(row('Summe', eur.format(sum()), 'receipt__row--sum'));
  box.replaceChildren(...rows);
}

function render() {
  fit();
  const sz = sizes[state.size];
  const n = state.items.length;
  const c = counts();
  grid.parentElement.style.setProperty('--cols', sz.cols);
  grid.style.setProperty('--cols', sz.cols);
  grid.replaceChildren(
    ...Array.from({ length: sz.slots }, (_, i) => {
      const id = state.items[i];
      const b = document.createElement('div');
      b.className = 'slot';
      b.setAttribute('aria-hidden', 'true');
      if (id) {
        const p = document.createElement('div');
        p.className = 'piece' + (i === state.newIndex ? ' is-new' : '');
        p.innerHTML = PIECES[id];
        b.append(p);
      }
      return b;
    }),
  );
  grid.setAttribute('aria-label', n ? `Dein Tablett: ${shop.varieties.filter((v) => c[v.id]).map((v) => `${c[v.id]} mal ${v.short}`).join(', ')}` : 'Dein Tablett, noch leer');
  $('#tray-legend').replaceChildren(...shop.varieties.filter((v) => c[v.id]).map((v) => {
    const li = document.createElement('li');
    const ic = document.createElement('span');
    ic.className = 'legend__ic';
    ic.setAttribute('aria-hidden', 'true');
    ic.innerHTML = PIECES[v.id];
    const t = document.createElement('span');
    t.textContent = `${c[v.id]} × ${v.short}`;
    li.append(ic, t);
    return li;
  }));
  state.newIndex = -1;
  $('#box-sub').textContent = `${n} von ${sz.slots} Plätzen`;
  $('#box-size-label').textContent = sz.label;
  $('#nav-box').textContent = `${n}/${sz.slots}`;
  $('.mast__box').setAttribute('aria-label', `Zur Box, ${n} von ${sz.slots} Plätzen belegt`);
  $$('input[name=size]').forEach((r) => { r.checked = r.value === state.size; r.disabled = sizes[r.value].slots < n; });
  $$('.dish').forEach((d) => {
    const k = c[d.dataset.var] || 0;
    $('[data-n]', d).textContent = k;
    $('[data-badge]', d).textContent = k;
    $('[data-badge]', d).hidden = k === 0;
    $('.stepper', d).hidden = k === 0;
    $('.dish__add', d).hidden = k > 0;
    d.classList.toggle('is-picked', k > 0);
  });
  $('#box-fill').disabled = n >= sz.slots;
  $('#box-clear').disabled = n === 0;
  renderReceipt();
  setOrderLinks();
  updateBar();
  saveForm();
}

// Stück hinzufügen. Ist die Box voll, wächst sie auf die nächste Größe.
function add(id) {
  if (state.items.length >= cap()) {
    const next = shop.sizes.find((s) => s.slots > cap());
    if (!next) {
      const m = `Eine Box fasst höchstens ${cap()} Stück. Für mehr bestell eine zweite Box oder frag nach einer Platte für Firmen.`;
      hint(m); say(m);
      return false;
    }
    state.size = next.id;
    const m = `Deine Box ist jetzt eine ${next.label} mit ${next.slots} Plätzen.`;
    hint(m); say(m);
  } else {
    hint('');
  }
  state.items.push(id);
  state.newIndex = state.items.length - 1;
  say(`${byId[id].short} hinzugefügt. ${state.items.length} von ${cap()}.`);
  render();
  return true;
}
function removeOne(id) {
  const i = state.items.lastIndexOf(id);
  if (i < 0) return;
  state.items.splice(i, 1);
  hint('');
  say(`${byId[id].short} entfernt. ${state.items.length} von ${cap()}.`);
  render();
}

$$('.dish').forEach((d) => {
  const id = d.dataset.var;
  $('.dish__add', d).addEventListener('click', () => { if (add(id)) $('[data-act=plus]', d).focus(); });
  $('[data-act=plus]', d).addEventListener('click', () => add(id));
  $('[data-act=minus]', d).addEventListener('click', () => {
    removeOne(id);
    if (!state.items.includes(id)) $('.dish__add', d).focus();
  });
});
$$('input[name=size]').forEach((r) => r.addEventListener('change', () => { state.size = r.value; state.manual = true; hint(''); render(); }));
$('#box-wrap').addEventListener('change', (e) => { state.wrap = e.target.checked; render(); });
['#box-name', '#box-phone', '#box-date', '#box-note'].forEach((s) => $(s).addEventListener('input', setOrderLinks));
$('#box-clear').addEventListener('click', () => { state.items = []; hint(''); orderHint(''); say('Box geleert.'); render(); });
$('#box-fill').addEventListener('click', () => {
  const order = shop.varieties.map((v) => v.id);
  let i = 0;
  while (state.items.length < cap()) { state.items.push(order[i % order.length]); i++; }
  state.newIndex = -1;
  hint('');
  say(`Box gefüllt. ${state.items.length} von ${cap()}.`);
  render();
});
// Abholtag: heute, solange der Laden noch offen ist, sonst morgen (Berliner Datum)
(() => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });
  const { day, min } = berlinNow();
  const today = shop.hours.schedule.find((h) => h.days.includes(day));
  const useToday = today && min < toMin(today.to);
  $('#box-date').min = fmt.format(new Date(Date.now() + (useToday ? 0 : 864e5)));
})();

// Fertige Boxen laden
$$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const p = shop.presets.find((x) => x.id === b.dataset.preset);
  if (!p) return;
  state.size = p.size;
  state.manual = true;
  state.items = shop.varieties.flatMap((v) => Array(p.mix[v.id] || 0).fill(v.id));
  hint('');
  orderHint('');
  say(`${p.name} geladen. ${state.items.length} Stück.`);
  render();
  const target = $('#box-title');
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
}));

/* ---------- Schwebende Box-Leiste ---------- */
// Sichtbar, sobald etwas in der Box liegt. Sie verschwindet erst, wenn „Bestellung“ (Schritt 4) mit der Summe im Bild ist oder schon hinter dir liegt.
const bar = $('#boxbar');
const orderStep = $('#boxform');
let orderSeen = false;
function updateBar() {
  const n = state.items.length;
  $('#boxbar-txt').textContent = `${n}/${cap()} · ${eur.format(sum())}`;
  bar.setAttribute('aria-label', `Deine Box: ${n} von ${cap()} Plätzen, ${eur.format(sum())}`);
  bar.hidden = n === 0 || orderSeen;
  $('#sumbar-n').textContent = `${n} von ${cap()} Plätzen`;
  $('#sumbar-sum').textContent = eur.format(sum());
}
new IntersectionObserver((es) => {
  const e = es[es.length - 1];
  orderSeen = e.isIntersecting || e.boundingClientRect.top < 0;
  updateBar();
}, { threshold: 0 }).observe(orderStep);

/* ---------- Firmen-Rechner ---------- */
const people = $('#b2b-people');
function calc() {
  const p = Number(people.value);
  const pp = Number($('input[name=b2b-pp]:checked').value);
  const pieces = p * pp;
  const trays = Math.ceil(pieces / shop.b2b.trayPieces);
  const price = pieces * shop.b2b.avgPrice;
  $('#b2b-people-out').textContent = p;
  $('#b2b-pieces').textContent = pieces;
  $('#b2b-trays').textContent = trays;
  $('#b2b-price').textContent = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price);
  const b2bText = `Hallo ${shop.name}, ich möchte ein Angebot für ${p} Personen anfragen.\n${pp} Stück pro Person, also ${pieces} Stück (${trays} Platten).\nRichtwert laut Rechner: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price)}.\nTermin und Ort:`;
  $('#b2b-send').href = wa(b2bText);
  $('#b2b-mail').href = mail(`Angebotsanfrage ${shop.name}`, b2bText);
}
people.addEventListener('input', calc);
$$('input[name=b2b-pp]').forEach((r) => r.addEventListener('change', calc));
calc();

/* ---------- Eingaben nie verlieren: Zwischenspeicher in sessionStorage (nur dieser Tab, nichts wird gesendet) ---------- */
// Die Einwilligung (Häkchen) wird bewusst nicht gespeichert und nicht wiederhergestellt.
const FORM_KEY = `form:${location.pathname}`;
const FIELDS = ['#box-name', '#box-phone', '#box-date', '#box-note'];
let restoring = false;
function saveForm() {
  if (restoring) return;
  try {
    const data = { items: state.items, size: state.size, manual: state.manual, wrap: state.wrap, f: FIELDS.map((s) => $(s).value) };
    const empty = !data.items.length && !data.wrap && data.f.every((v) => !v);
    if (empty) sessionStorage.removeItem(FORM_KEY); else sessionStorage.setItem(FORM_KEY, JSON.stringify(data));
  } catch {}
}
function clearForm() { try { sessionStorage.removeItem(FORM_KEY); } catch {} }
function restoreForm() {
  try {
    const raw = sessionStorage.getItem(FORM_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    restoring = true;
    if (Array.isArray(d.items)) state.items = d.items.filter((id) => byId[id]);
    if (sizes[d.size]) { state.size = d.size; state.manual = !!d.manual; }
    state.wrap = !!d.wrap;
    $('#box-wrap').checked = state.wrap;
    FIELDS.forEach((s, i) => { if (typeof d.f?.[i] === 'string') $(s).value = d.f[i]; });
    const dateEl = $('#box-date');
    if (dateEl.min && dateEl.value && dateEl.value < dateEl.min) dateEl.value = '';
  } catch {} finally { restoring = false; }
}
FIELDS.forEach((s) => $(s).addEventListener('input', saveForm));
restoreForm();

render();

/* ---------- Hero-Spiel: drei in einer Reihe ---------- */
(() => {
  const bed = $('#game-bed');
  if (!bed) return;
  const tray = $('#game');
  const R = 4;
  const C = 5;
  const TYPES = ['pistazie', 'walnuss', 'sarma', 'kadayif', 'lokum'];
  const slots = $$('.slot', bed);
  const grid = slots.map((s) => s.dataset.id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = () => TYPES[Math.floor(Math.random() * TYPES.length)];
  let busy = !reduce;
  let sel = -1;
  let score = 0;
  let rover = 0;

  function matches(g) {
    const out = new Set();
    for (let r = 0; r < R; r++) {
      let run = 1;
      for (let c = 1; c <= C; c++) {
        if (c < C && g[r * C + c] === g[r * C + c - 1]) run++;
        else { if (run >= 3) for (let k = 1; k <= run; k++) out.add(r * C + c - k); run = 1; }
      }
    }
    for (let c = 0; c < C; c++) {
      let run = 1;
      for (let r = 1; r <= R; r++) {
        if (r < R && g[r * C + c] === g[(r - 1) * C + c]) run++;
        else { if (run >= 3) for (let k = 1; k <= run; k++) out.add((r - k) * C + c); run = 1; }
      }
    }
    return out;
  }
  function hasMove(g) {
    for (let i = 0; i < R * C; i++) {
      for (const j of [i % C < C - 1 ? i + 1 : -1, i + C < R * C ? i + C : -1]) {
        if (j < 0) continue;
        const h = g.slice();
        [h[i], h[j]] = [h[j], h[i]];
        if (matches(h).size) return true;
      }
    }
    return false;
  }
  function paint(i, fresh) {
    const s = slots[i];
    const id = grid[i];
    s.dataset.id = id;
    s.setAttribute('aria-label', `${byId[id].short}, Reihe ${Math.floor(i / C) + 1}, Spalte ${(i % C) + 1}`);
    const p = $('.piece', s);
    p.innerHTML = PIECES[id];
    p.classList.remove('is-gone', 'is-new');
    if (fresh) { void p.offsetWidth; p.classList.add('is-new'); }
  }
  async function slide(a, b) {
    const pa = $('.piece', slots[a]);
    const pb = $('.piece', slots[b]);
    const dx = slots[b].offsetLeft - slots[a].offsetLeft;
    const dy = slots[b].offsetTop - slots[a].offsetTop;
    pa.style.transition = pb.style.transition = 'transform 170ms var(--ease-out)';
    pa.style.transform = `translate(${dx}px,${dy}px)`;
    pb.style.transform = `translate(${-dx}px,${-dy}px)`;
    await sleep(reduce ? 0 : 180);
    pa.style.transition = pb.style.transition = 'none';
    pa.style.transform = pb.style.transform = '';
    void pa.offsetWidth;
    pa.style.transition = pb.style.transition = '';
  }
  const swap = (a, b) => { [grid[a], grid[b]] = [grid[b], grid[a]]; paint(a); paint(b); };
  function showScore() { $('#game-score').textContent = score; }

  async function settle() {
    let m;
    while ((m = matches(grid)).size) {
      m.forEach((i) => $('.piece', slots[i]).classList.add('is-gone'));
      score += m.size;
      showScore();
      await sleep(reduce ? 0 : 260);
      const changed = new Set();
      for (let c = 0; c < C; c++) {
        let w = R - 1;
        for (let r = R - 1; r >= 0; r--) {
          if (!m.has(r * C + c)) {
            if (w !== r) { grid[w * C + c] = grid[r * C + c]; changed.add(w * C + c); }
            w--;
          }
        }
        for (let r = w; r >= 0; r--) { grid[r * C + c] = rnd(); changed.add(r * C + c); }
      }
      slots.forEach((_, i) => paint(i, changed.has(i)));
      await sleep(reduce ? 0 : 420);
    }
    if (!hasMove(grid)) {
      let g;
      do { g = Array.from({ length: R * C }, rnd); } while (matches(g).size || !hasMove(g));
      g.forEach((id, i) => { grid[i] = id; });
      slots.forEach((_, i) => paint(i, true));
      await sleep(reduce ? 0 : 450);
    }
  }
  async function pick(i) {
    if (busy) return;
    if (sel < 0) { sel = i; slots[i].classList.add('is-sel'); return; }
    const a = sel;
    slots[a].classList.remove('is-sel');
    sel = -1;
    if (a === i) return;
    if (Math.abs(Math.floor(a / C) - Math.floor(i / C)) + Math.abs((a % C) - (i % C)) !== 1) { sel = i; slots[i].classList.add('is-sel'); return; }
    busy = true;
    await slide(a, i);
    swap(a, i);
    if (matches(grid).size) await settle();
    else { await slide(a, i); swap(a, i); }
    busy = false;
  }
  function setRover(i) {
    slots[rover].tabIndex = -1;
    rover = i;
    slots[rover].tabIndex = 0;
  }
  // Sicherheitsnetz: Startbelegung ohne Zug neu mischen
  if (!hasMove(grid)) {
    let g;
    do { g = Array.from({ length: R * C }, rnd); } while (matches(g).size || !hasMove(g));
    g.forEach((id, i) => { grid[i] = id; });
    slots.forEach((_, i) => paint(i));
  }
  setRover(0);
  slots.forEach((s, i) => {
    s.addEventListener('click', () => { setRover(i); pick(i); });
    s.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
      if (!d) return;
      e.preventDefault();
      const r = Math.floor(i / C) + d[0];
      const c = (i % C) + d[1];
      if (r < 0 || r >= R || c < 0 || c >= C) return;
      setRover(r * C + c);
      slots[rover].focus();
    });
  });
  if (!reduce) setTimeout(() => { tray.classList.remove('is-intro'); busy = false; }, 2500);
  else tray.classList.remove('is-intro');
})();

/* ---------- Mobiles Menü: nach Klick auf einen Link schließen ---------- */
const menu = $('.menu');
$$('.menu__list a').forEach((a) => a.addEventListener('click', () => menu.removeAttribute('open')));
document.addEventListener('pointerdown', (e) => { if (menu.open && !menu.contains(e.target)) menu.removeAttribute('open'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { menu.removeAttribute('open'); $('summary', menu).focus(); } });
