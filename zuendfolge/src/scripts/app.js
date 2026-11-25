// Zündfolge: Zündung, Bordcomputer, HU-Rechner, Tankanzeige, Termin. Ohne externe Aufrufe.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = reduce ? 'auto' : 'smooth';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 1. Zündung: Selbsttest wie beim echten Start ---------- */
const hero = $('.hero');
const cluster = $('#cluster');
const statusEl = $('[data-status]');
const needles = $$('.hero .needle');
const cyl = $$('.logo-cyl i');
const setNeedle = (n, v) => n.style.setProperty('--v', String(v));
const restNeedles = () => needles.forEach((n) => setNeedle(n, n.dataset.rest ?? 0));
const FIRING = [1, 3, 4, 2];
document.documentElement.classList.add('js');

async function ignite() {
  if (reduce) {
    cluster.dataset.state = 'ready';
    statusEl.textContent = 'Bereit';
    restNeedles();
    return;
  }
  cluster.dataset.state = 'test';
  hero.classList.add('is-test');
  needles.forEach((n) => setNeedle(n, 1));
  for (const n of FIRING) {
    cyl.find((c) => c.dataset.n === String(n))?.classList.add('on');
    await wait(140);
  }
  await wait(380);
  restNeedles();
  hero.classList.remove('is-test');
  cyl.forEach((c) => c.classList.remove('on'));
  await wait(500);
  cluster.dataset.state = 'ready';
  statusEl.textContent = 'Bereit';
}
window.addEventListener('load', () => setTimeout(ignite, 250));

/* ---------- 2. Bordcomputer + Befund (Sheet am Telefon, Karte am Rechner) ---------- */
const tabs = $$('.mode');
const lists = $$('.sym-list');
const syms = $$('.sym');
const befunde = $$('.befund');
const dlg = $('#befund');
const inline = matchMedia('(min-width: 1100px)');
const ITEMS = Object.fromEntries(syms.map((s) => [s.dataset.id, {
  id: s.dataset.id, label: s.dataset.label, ab: Number(s.dataset.ab) || 0, preis: s.dataset.preis, extra: !!s.dataset.extra,
}]));

function syncDialog() {
  if (inline.matches) { if (dlg.matches(':modal')) dlg.close(); if (!dlg.open) dlg.show(); }
  else if (dlg.open && !dlg.matches(':modal')) dlg.close();
}
inline.addEventListener('change', syncDialog);
syncDialog();
$('.sheet-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg && dlg.matches(':modal')) dlg.close(); });

function setMode(id) {
  tabs.forEach((t) => {
    const on = t.dataset.mode === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  lists.forEach((l) => (l.hidden = l.dataset.mode !== id));
}
function pick(id, { open = false, scroll = false } = {}) {
  const sym = syms.find((s) => s.dataset.id === id);
  if (!sym) return;
  setMode(sym.dataset.mode);
  syms.forEach((s) => s.setAttribute('aria-pressed', String(s === sym)));
  befunde.forEach((b) => (b.hidden = b.id !== `b-${id}`));
  if (!inline.matches) {
    if (open && !dlg.open) dlg.showModal();
    if (open) dlg.scrollTop = 0;
  } else if (scroll) $('#diagnose').scrollIntoView({ behavior: smooth, block: 'start' });
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => {
    setMode(t.dataset.mode);
    const first = $(`.sym-list[data-mode="${t.dataset.mode}"] .sym`);
    if (first) pick(first.dataset.id);
  });
  t.addEventListener('keydown', (e) => {
    const k = e.key;
    const dir = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 0;
    if (!dir && k !== 'Home' && k !== 'End') return;
    e.preventDefault();
    const next = k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (i + dir + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  });
});
syms.forEach((s) => s.addEventListener('click', () => pick(s.dataset.id, { open: true })));
$$('[data-pick]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.pick, { open: true, scroll: true })));
pick('motor');

/* ---------- Auftrag: Liste, Zwischensumme, Entwurf ---------- */
const form = $('#tform');
const orderList = $('#order-list');
const orderEmpty = $('#order-empty');
const orderSum = $('#order-sum');
const orderNote = $('#order-note');
const addSel = $('#add-select');
const callTermin = $('#callbar-termin');
const errEl = $('#form-err');
const KEY = 'zf-draft-v1';
let order = [];
const eur = (n) => `${n.toLocaleString('de-DE')} €`;

function totals() {
  const sum = order.reduce((a, id) => a + ITEMS[id].ab, 0);
  return { sum, text: order.length ? (sum ? `ab ${eur(sum)}` : 'Kostenvoranschlag gratis') : 'noch nichts gewählt' };
}
function renderOrder() {
  const t = totals();
  orderList.replaceChildren(...order.map((id) => {
    const it = ITEMS[id];
    const li = document.createElement('li');
    const main = document.createElement('span'); main.className = 'o-main';
    const b = document.createElement('b'); b.textContent = it.label;
    const sm = document.createElement('small'); sm.textContent = it.preis;
    main.append(b, sm);
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'o-x'; x.dataset.remove = id;
    x.setAttribute('aria-label', `${it.label} entfernen`);
    x.textContent = '×';
    li.append(main, x);
    return li;
  }));
  orderEmpty.hidden = order.length > 0;
  orderSum.textContent = t.text;
  orderNote.hidden = !order.some((id) => ITEMS[id].extra);
  $$('[data-add]').forEach((btn) => {
    const on = order.includes(btn.dataset.add);
    btn.setAttribute('aria-pressed', String(on));
    $('[data-add-label]', btn).textContent = on ? 'Im Auftrag, entfernen' : 'Zum Auftrag hinzufügen';
  });
  $$('[data-total-line]').forEach((p) => {
    p.hidden = !order.length;
    p.textContent = order.length ? `Dein Auftrag: ${order.length} ${order.length === 1 ? 'Leistung' : 'Leistungen'}, ${t.text}` : '';
  });
  callTermin.textContent = order.length ? `Termin, ${t.text}` : 'Termin anfragen';
  saveDraft();
}
function toggle(id, force) {
  const has = order.includes(id);
  const want = force ?? !has;
  if (want && !has) order.push(id);
  if (!want && has) order = order.filter((x) => x !== id);
  renderOrder();
}
orderList.addEventListener('click', (e) => {
  const x = e.target.closest('[data-remove]');
  if (x) toggle(x.dataset.remove, false);
});
addSel.addEventListener('change', () => {
  if (ITEMS[addSel.value]) toggle(addSel.value, true);
  addSel.value = '';
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-add]');
  if (a) return toggle(a.dataset.add);
  const b = e.target.closest('[data-book]');
  if (!b) return;
  if (ITEMS[b.dataset.book] && !order.includes(b.dataset.book)) toggle(b.dataset.book, true);
  if (dlg.matches(':modal')) dlg.close();
  $('#ticket').hidden = true;
  form.hidden = false;
  $('#termin').scrollIntoView({ behavior: smooth, block: 'start' });
  setTimeout(() => $('#f-name').focus({ preventScroll: true }), reduce ? 0 : 650);
});

/* Entwurf: bleibt im Tab erhalten, auch nach Datenschutz/Impressum und Reload */
function saveDraft() {
  try {
    const fields = {};
    [...form.elements].forEach((el) => {
      if (!el.name || el.name === 'consent') return;
      fields[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    sessionStorage.setItem(KEY, JSON.stringify({ order, fields }));
  } catch {}
}
function clearDraft() { try { sessionStorage.removeItem(KEY); } catch {} }
function restoreDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!d) return;
    order = (d.order || []).filter((id) => ITEMS[id]);
    [...form.elements].forEach((el) => {
      if (!el.name || el.name === 'consent' || !(el.name in d.fields)) return;
      if (el.type === 'checkbox') el.checked = !!d.fields[el.name];
      else el.value = d.fields[el.name];
    });
  } catch {}
}
restoreDraft();
renderOrder();
form.addEventListener('input', saveDraft);
form.addEventListener('change', saveDraft);
addEventListener('pagehide', saveDraft);

/* ---------- 3. HU-Plakette ---------- */
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const COLORS = ['blau', 'gelb', 'braun', 'rosa', 'gruen', 'orange']; // 2026 = blau, danach alle sechs Jahre
const COLOR_DE = { blau: 'blau', gelb: 'gelb', braun: 'braun', rosa: 'rosa', gruen: 'grün', orange: 'orange' };
const colorOf = (y) => COLORS[(((y - 2026) % 6) + 6) % 6];
const pm = $('#pm'), py = $('#py');
const now = new Date();
const thisYear = now.getFullYear();
MONTHS.forEach((m, i) => pm.add(new Option(m, String(i + 1))));
for (let y = thisYear - 1; y <= thisYear + 3; y++) py.add(new Option(String(y), String(y)));
{
  const d = new Date(thisYear, now.getMonth() + 4, 1);
  pm.value = String(d.getMonth() + 1);
  py.value = String(d.getFullYear());
}
const plak = $('#plak');
const nums = $('#pl-nums');
const out = $('.plak-out');
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function renderPlak() {
  const m = Number(pm.value), y = Number(py.value);
  const c = colorOf(y);
  plak.dataset.color = c;
  nums.style.transform = `rotate(${-(m % 12) * 30}deg)`;
  $$('.pl-n', nums).forEach((n) => n.classList.toggle('is-top', Number(n.dataset.k) === m));
  $('#pl-year').textContent = String(y).slice(-2);
  $('#plak-cap').textContent = `Plakette ${y}: ${COLOR_DE[c]}`;

  const due = new Date(y, m, 0, 23, 59, 59); // Ende des Monats auf der Plakette
  const diff = now.getFullYear() * 12 + (now.getMonth() + 1) - (y * 12 + m); // Monate seit Fälligkeitsmonat
  const days = Math.ceil((due - now) / 864e5);
  const line = $('#plak-line'), sub = $('#plak-sub');
  const end = `${MONTHS[m - 1]} ${y}`;
  let state = 'ok';
  if (diff <= -3) {
    line.textContent = `Noch ${pl(-diff, 'Monat', 'Monate')} Zeit`;
    sub.textContent = `Deine HU ist Ende ${end} fällig. Plane den Vorab-Check etwa vier Wochen vorher.`;
  } else if (diff <= 0) {
    state = 'soon';
    line.textContent = diff === 0 ? `Noch ${pl(Math.max(days, 0), 'Tag', 'Tage')}` : `Noch gut ${pl(-diff, 'Monat', 'Monate')}`;
    sub.textContent = `Deine HU ist Ende ${end} fällig. Jetzt ist ein guter Moment für den Vorab-Check.`;
  } else if (diff <= 2) {
    state = 'soon';
    line.textContent = `Seit ${pl(diff, 'Monat', 'Monaten')} überfällig`;
    sub.textContent = `Bis zu zwei Monate nach Fälligkeit gibt es noch kein Verwarngeld. Danach wird es teuer, also bald einen Termin machen.`;
  } else {
    state = 'late';
    const fine = diff >= 9 ? '60 € und 1 Punkt in Flensburg' : diff >= 5 ? '25 €' : '15 €';
    line.textContent = `Seit ${diff} Monaten überfällig`;
    sub.textContent = `Dafür droht ein Verwarngeld von ${fine}, dazu 20 % Aufschlag auf die Prüfgebühr. Mach jetzt einen Termin.`;
  }
  out.dataset.state = state;
}
pm.addEventListener('change', renderPlak);
py.addEventListener('change', renderPlak);
$('#plakform').addEventListener('submit', (e) => e.preventDefault());
renderPlak();

/* ---------- 5. Tankanzeige = Rest des Öffnungstags ---------- */
const tank = $('#tank');
const hours = JSON.parse(tank.dataset.hours);
const DAY = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 0 };
const DAYNAME = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function berlinNow() {
  const parts = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: DAY[get('weekday').replace('.', '')] ?? 0, min: toMin(`${get('hour').replace('24', '00')}:${get('minute')}`) };
}
function nextOpen(day, min) {
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7;
    const h = hours[String(d)];
    if (!h) continue;
    if (i === 0 && min >= toMin(h[0])) continue;
    const label = i === 0 ? 'heute' : i === 1 ? 'morgen' : DAYNAME[d];
    return `${label} ${h[0].replace(/^0/, '')}`;
  }
  return '';
}
function renderTank() {
  const { day, min } = berlinNow();
  const h = hours[String(day)];
  const needle = $('.needle', tank);
  const line = $('#tank-line');
  if (h && min >= toMin(h[0]) && min < toMin(h[1])) {
    const frac = (toMin(h[1]) - min) / (toMin(h[1]) - toMin(h[0]));
    tank.dataset.state = 'open';
    line.textContent = `Jetzt geöffnet bis ${h[1].replace(/^0/, '')} Uhr`;
    return frac;
  }
  tank.dataset.state = 'closed';
  line.textContent = `Geschlossen, öffnet ${nextOpen(day, min)} Uhr`;
  return 0;
}
const tankV = renderTank();
const showTank = () => setNeedle($('.needle', tank), tankV);
if (reduce || !('IntersectionObserver' in window)) showTank();
else {
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (showTank(), io.disconnect()), { threshold: 0.5 });
  io.observe(tank);
}

/* ---------- Formular: Auftragszettel statt Versand (Demo) ---------- */
const ticket = $('#ticket');
const fd = $('#f-date');
{
  const t = new Date(); t.setDate(t.getDate() + 1);
  fd.min = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const d = new FormData(form);
  const miss = [];
  if (!order.length) miss.push(['Auftrag', addSel]);
  if (!String(d.get('name')).trim()) miss.push(['Name', $('#f-name')]);
  if (!String(d.get('tel')).trim()) miss.push(['Telefon', $('#f-tel')]);
  if (!d.get('consent')) miss.push(['Einverständnis zur Datenschutzerklärung', $('#f-consent')]);
  ['#f-name', '#f-tel', '#f-consent', '#add-select'].forEach((s) => $(s).removeAttribute('aria-invalid'));
  miss.forEach(([, el]) => el.setAttribute('aria-invalid', 'true'));
  errEl.hidden = !miss.length;
  if (miss.length) {
    errEl.textContent = `Bitte noch ergänzen: ${miss.map(([n]) => n).join(', ')}.`;
    miss[0][1].focus();
    return;
  }
  const t = totals();
  const zeit = d.get('zeit') && d.get('zeit') !== 'egal' ? `, ${d.get('zeit')}` : '';
  const rows = [
    ['Leistungen', order.map((id) => ITEMS[id].label)],
    ['Richtwert', t.text],
    ['Name', d.get('name')],
    ['Telefon', d.get('tel')],
    ['Fahrzeug', d.get('auto')],
    ['Wunschtermin', d.get('datum') ? new Date(`${d.get('datum')}T12:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) + zeit : ''],
    ['Abholung', d.get('holen') ? 'Bitte abholen und zurückbringen' : ''],
    ['Hinweis', d.get('info')],
  ].filter(([, v]) => (Array.isArray(v) ? v.length : String(v).trim()));
  $('#ticket-list').replaceChildren(...rows.map(([k, v]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd');
    if (Array.isArray(v)) {
      const ul = document.createElement('ul');
      v.forEach((x) => { const li = document.createElement('li'); li.textContent = x; ul.append(li); });
      dd.append(ul);
    } else dd.textContent = String(v);
    row.append(dt, dd);
    return row;
  }));
  form.hidden = true;
  ticket.hidden = false;
  clearDraft();
  ticket.focus({ preventScroll: true });
  ticket.scrollIntoView({ behavior: smooth, block: 'center' });
});
$('#ticket-new').addEventListener('click', () => {
  ticket.hidden = true; form.hidden = false; form.reset(); order = []; renderOrder(); clearDraft(); $('#f-name').focus();
});

/* ---------- Anrufleiste: am Telefon immer da, nur beim Formular weg ---------- */
const bar = $('#callbar');
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => bar.classList.toggle('is-off', e.isIntersecting), { threshold: 0.15 }).observe($('#termin'));
}

/* ---------- Fotos: fehlende Bilder ausblenden, damit keine Lücken entstehen ---------- */
{
  const wrap = $('.proto-wrap');
  const drop = (img) => {
    img.closest('.shot')?.remove();
    if (!$('.shot')) wrap.classList.add('no-shots');
  };
  $$('.shot img').forEach((img) => {
    img.addEventListener('error', () => drop(img));
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('loading') !== 'lazy') drop(img);
  });
}
