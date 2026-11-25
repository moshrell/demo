// Backstube Morgenrot: Zeitleiste, Uhr, Lichtwechsel, Live-Status, Vorbestell-Formular.
// Nichts davon ist Pflicht: ohne JavaScript bleibt die Seite lesbar (erstes Bild, alle Karten).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');
const fmt = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(Math.round(min) % 60)}`;

/* ---------- 1. Berliner Uhrzeit, Öffnungsstatus, Sprung zu „jetzt“ ---------- */
function berlinNow() {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday] ?? 1;
  return { day, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

(function liveStatus() {
  const statusEl = $('[data-status]');
  if (!statusEl) return;
  const hours = JSON.parse(statusEl.dataset.hours);
  const now = berlinNow();
  const today = hours.find((h) => h.days.includes(now.day));
  const tomorrow = hours.find((h) => h.days.includes((now.day + 1) % 7));
  let open = false;
  let text;
  if (today && now.min >= today.open && now.min < today.close) {
    open = true;
    text = `Jetzt geöffnet · bis ${fmt(today.close)} Uhr`;
  } else if (today && now.min < today.open) {
    text = `Noch geschlossen · öffnet um ${fmt(today.open)} Uhr`;
  } else {
    text = `Geschlossen · morgen ab ${fmt(tomorrow ? tomorrow.open : 360)} Uhr`;
  }
  statusEl.textContent = text;
  statusEl.dataset.open = String(open);

  const jump = $('[data-jump]');
  if (!jump) return;
  const slots = JSON.parse(jump.dataset.slots);
  let idx = 0;
  slots.forEach((s, i) => { if (s.min <= now.min) idx = i; });
  const nowEl = $('[data-now]');
  if (open && nowEl) {
    nowEl.textContent = `Gerade im Regal: ${slots[idx].now}`;
    nowEl.hidden = false;
  }
  jump.href = `#slot-${slots[idx].id}`;
  jump.textContent = `Zu ${fmt(now.min)} Uhr springen`;
})();

/* ---------- 2. Zeitleiste: welcher Abschnitt liegt in der Bildmitte? ---------- */
const ladder = $$('.ladder a');
let current = -2;

function activate(i) {
  if (i === current) return;
  current = i;
  ladder.forEach((a, k) => {
    if (k === i) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
  });
}


/* ---------- 2b. Bilder: je nach Uhrzeit das nächste Bild, mit eigener Überblendung in Scroll-Richtung ---------- */
const stage = $('.stage');
const layers = $$('.layer');
const frameMin = layers.map((l) => Number(l.dataset.min));
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let active = 0;
let zTop = 2;

function show(k) {
  if (k === active || !layers[k]) return;
  active = k;
  layers.forEach((l, i) => { if (i >= k - 1 && i <= k + 2) l.hidden = false; }); // Nachbarn rechtzeitig laden
  layers[k].style.zIndex = String(++zTop); // das neue Bild liegt oben und blendet ein
  layers.forEach((l, i) => l.classList.toggle('is-on', i === k));
}

// Das Bild wechselt erst, wenn die Uhrzeit kurz bei einem Bild bleibt; die Überblendung läuft dann
// zeitgesteuert zu Ende, unabhängig von der Scroll-Geschwindigkeit.
let want = 0;
let wantTimer = 0;
function paint(m) {
  if (!layers.length) return;
  let k = 0;
  frameMin.forEach((fm, i) => { if (Math.abs(fm - m) < Math.abs(frameMin[k] - m)) k = i; });
  if (k === want) return;
  want = k;
  window.clearTimeout(wantTimer);
  wantTimer = window.setTimeout(() => show(want), 110);
}

function heroFade() {
  const hero = $('.hero');
  if (!stage || !hero) return;
  const r = window.scrollY / (hero.offsetHeight * 0.95);
  const v = Math.max(0, Math.min(1, 1 - r * r)); // hält den Schleier, solange der Text im Bild ist
  stage.style.setProperty('--hero-fade', String(v));
}

/* ---------- 3. Die Uhr läuft mit dem Scroll ---------- */
const clock = $('[data-clock]');
const slotEls = $$('.slot');
let anchors = [];
let raf = 0;
let shown = '';

function measure() {
  anchors = slotEls.map((s) => {
    const r = s.getBoundingClientRect();
    return { y: r.top + window.scrollY + r.height / 2, m: Number(s.dataset.min) };
  });
}

/* Telefon: Die Karten liegen als festes Band unten und wandern beim Scrollen von rechts nach links.
   So bleibt das Foto oben frei. Jede Karte bleibt kurz stehen und rutscht dann zur nächsten. */
const track = $('.track');
const mobileMq = window.matchMedia('(max-width: 47.99rem)');
function dock(y) {
  if (!track) return;
  const on = mobileMq.matches;
  track.classList.toggle('is-dock', on);
  if (!on || !anchors.length) return;
  const n = slotEls.length;
  const vh = window.innerHeight;
  const sp = n > 1 ? anchors[1].y - anchors[0].y : vh;
  const slotStart = anchors[0].y - sp / 2;
  const sc = window.scrollY;
  let pos;
  if (sc < slotStart) {
    pos = -(1 - Math.max(0, Math.min(1, (sc - slotStart + 0.6 * vh) / (0.6 * vh)))); // erste Karte fährt am Ende des Kopfbilds ein
  } else {
    const u = (y - anchors[0].y) / sp;
    const fl = Math.floor(u);
    const f = u - fl;
    const t = Math.max(0, Math.min(1, (f - 0.3) / 0.4));
    pos = u < 0 ? 0 : fl >= n - 1 ? n - 1 : fl + t * t * (3 - 2 * t);
  }
  const out = Math.max(0, Math.min(1, (y - anchors[n - 1].y - 0.15 * sp) / (0.3 * sp)));
  slotEls.forEach((sl, i) => {
    const el = $('.slot__in', sl);
    if (!el) return;
    const x = (i - pos) * 108;
    el.style.setProperty('--x', String(Math.max(-110, Math.min(110, x))));
    el.style.setProperty('--yo', String(out * 130));
    el.style.setProperty('--vis', Math.abs(x) >= 108 ? 'hidden' : 'visible');
  });
}

let target = 0;
let eased = null;

function tick() {
  raf = 0;
  if (!clock || !anchors.length) return;
  const y = window.scrollY + window.innerHeight / 2;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  let m;
  if (y <= first.y) m = first.m;
  else if (y >= last.y) m = last.m;
  else {
    let k = 0;
    while (k < anchors.length - 2 && y >= anchors[k + 1].y) k++;
    const a = anchors[k];
    const b = anchors[k + 1];
    m = a.m + ((y - a.y) / (b.y - a.y)) * (b.m - a.m);
  }
  target = m;
  let near = 0;
  anchors.forEach((an, k) => { if (Math.abs(an.m - m) < Math.abs(anchors[near].m - m)) near = k; });
  activate(y <= first.y ? -1 : near); // Zeitleiste folgt der Uhrzeit, auch hinter dem letzten Abschnitt
  if (eased === null || reduceMotion) eased = m;
  else eased += (m - eased) * 0.16; // die Uhr läuft weich nach, auch wenn das Scrollen stoppt
  paint(m);
  heroFade();
  dock(y);
  const text = fmt(eased);
  if (text !== shown) {
    shown = text;
    clock.textContent = text;
  }
  if (Math.abs(target - eased) > 0.4) schedule();
  else if (eased !== target) { eased = target; schedule(); }
}

/* Sprung zu einer Uhrzeit: so scrollen, dass die Uhr in der Ecke genau diese Zeit zeigt */
function yForMinute(m) {
  measure();
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (m <= first.m) return first.y;
  if (m >= last.m) return last.y;
  let k = 0;
  while (k < anchors.length - 2 && m >= anchors[k + 1].m) k++;
  const a = anchors[k];
  const b = anchors[k + 1];
  return a.y + ((m - a.m) / (b.m - a.m)) * (b.y - a.y);
}
function goToMinute(m) {
  window.scrollTo({ top: yForMinute(m) - window.innerHeight / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('.ladder a, [data-jump]');
  if (!a || !slotEls.length || e.metaKey || e.ctrlKey || e.shiftKey) return;
  let m;
  if (a.matches('[data-jump]')) m = berlinNow().min;
  else {
    const slot = document.getElementById(a.getAttribute('href').slice(1));
    if (!slot) return;
    m = Number(slot.dataset.min);
  }
  e.preventDefault();
  goToMinute(m);
});

/* Telefon: Bildfläche = Höhe minus höchste Karte, damit keine Karte das Foto überdeckt */
function sizeCards() {
  const stageEl = $('.stage');
  const cards = $$('.card');
  if (!stageEl || !cards.length) return;
  const h = Math.max(...cards.map((c) => c.getBoundingClientRect().height));
  stageEl.style.setProperty('--card-h', `${Math.ceil(h)}px`);
}
sizeCards();
window.addEventListener('resize', sizeCards);
window.addEventListener('load', sizeCards);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeCards);

function schedule() {
  if (!raf) raf = requestAnimationFrame(tick);
}

if (clock && slotEls.length) {
  measure();
  tick();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { measure(); schedule(); });
  window.addEventListener('load', () => { measure(); schedule(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); schedule(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); schedule(); }).observe($('.track'));
}

/* ---------- 4. Die Tüte für morgen ---------- */
(function order() {
  const form = $('#tuete-form');
  if (!form) return;
  const inputs = $$('.qty input', form);
  const totalEl = $('[data-total]', form);
  const countEl = $('[data-count]', form);
  const consent = $('input[name="privacy"]', form);
  const msg = $('[data-msg]', form);
  const submit = $('[data-submit]', form);
  const done = $('[data-done]');
  const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

  const count = (input) => Math.max(0, Math.min(20, parseInt(input.value, 10) || 0));

  function refresh() {
    let cents = 0;
    inputs.forEach((input) => {
      const n = count(input);
      input.value = String(n);
      cents += n * Number(input.dataset.cents);
      input.closest('.order__row').classList.toggle('is-picked', n > 0);
      const row = input.closest('.qty');
      $('[data-step="-1"]', row).disabled = n <= 0;
      $('[data-step="1"]', row).disabled = n >= 20;
    });
    totalEl.textContent = euro.format(cents / 100);
    const pieces = inputs.reduce((sum, i) => sum + count(i), 0);
    if (countEl) countEl.textContent = pieces === 0 ? 'Noch nichts gewählt' : `Ihre Tüte: ${pieces} Artikel`;
    if (cents > 0) msg.textContent = '';
    return cents;
  }

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    const input = $('input', btn.closest('.qty'));
    input.value = String(count(input) + Number(btn.dataset.step));
    refresh();
  });
  inputs.forEach((input) => input.addEventListener('input', refresh));

  /* Eingaben nie verlieren: Zwischenspeicher im Tab (sessionStorage), Einwilligung wird nie gespeichert */
  const KEY = 'form:' + location.pathname;
  const fields = () => $$('#f-name, #f-tel', form);
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        q: inputs.map((i) => count(i)),
        pickup: ($('input[name="pickup"]:checked', form) || {}).value || '',
        f: fields().map((f) => f.value),
      }));
    } catch (_) {}
  };
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (d) {
      inputs.forEach((i, k) => { i.value = String(d.q?.[k] || 0); });
      const r = $$('input[name="pickup"]', form).find((x) => x.value === d.pickup);
      if (r) r.checked = true;
      fields().forEach((f, k) => { f.value = d.f?.[k] || ''; });
    }
  } catch (_) {}
  if (consent) consent.checked = false;
  window.addEventListener('pageshow', () => { if (consent) consent.checked = false; });
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  form.addEventListener('click', () => window.setTimeout(save, 0));
  refresh();

  $$('#f-name, #f-tel', form).forEach((f) => f.addEventListener('input', () => f.removeAttribute('aria-invalid')));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cents = refresh();
    const name = $('#f-name', form);
    const tel = $('#f-tel', form);
    const bad = [name, tel].filter((f) => !f.value.trim());
    [name, tel].forEach((f) => (bad.includes(f) ? f.setAttribute('aria-invalid', 'true') : f.removeAttribute('aria-invalid')));

    if (cents === 0) {
      msg.textContent = 'Bitte wählen Sie mindestens einen Artikel.';
      $('.qty button[data-step="1"]', form).focus();
      return;
    }
    if (bad.length) {
      msg.textContent = 'Bitte tragen Sie Name und Telefonnummer ein.';
      bad[0].focus();
      return;
    }
    consent.closest('.consent').classList.toggle('is-invalid', !consent.checked);
    if (!consent.checked) {
      msg.textContent = 'Bitte bestätigen Sie den Hinweis zum Datenschutz.';
      consent.focus();
      return;
    }

    msg.textContent = '';
    submit.setAttribute('aria-busy', 'true');
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = 'Wird gesendet …';

    window.setTimeout(() => {
      const pickup = $('input[name="pickup"]:checked', form).value;
      const lines = inputs
        .filter((i) => count(i) > 0)
        .map((i) => `<li><span>${count(i)} × ${i.closest('.order__row').querySelector('.order__name').textContent}</span><span>${euro.format((count(i) * Number(i.dataset.cents)) / 100)}</span></li>`)
        .join('');
      $('[data-done-title]', done).textContent = `Danke, ${name.value.trim()}. Ihre Tüte liegt morgen um ${pickup} Uhr bereit.`;
      $('[data-done-list]', done).innerHTML = `${lines}<li><strong>Summe</strong><strong>${euro.format(cents / 100)}</strong></li>`;
      try { sessionStorage.removeItem(KEY); } catch (_) {}
      form.hidden = true;
      done.hidden = false;
      done.focus({ preventScroll: true });
      done.scrollIntoView({ block: 'nearest' });
      submit.removeAttribute('aria-busy');
      submit.disabled = false;
      submit.textContent = label;
    }, 450);
  });
})();
