// Studio Kamm: логика записи «как в приложении».
// Состояние → рендер. Шаги: 0 услуги, 1 мастер, 2 время, 3 данные, 4 билет.
const app = document.querySelector('[data-app]');
const $ = (s, r = app) => r.querySelector(s);
const $$ = (s, r = app) => [...r.querySelectorAll(s)];
const team = JSON.parse(app.dataset.team);
const hours = JSON.parse(app.dataset.hours);
const SLOT = Number(app.dataset.slot), MAX_DIRECT = Number(app.dataset.max);
const stage = (key) => window.dispatchEvent(new CustomEvent('kamm:stage', { detail: key }));

const ROUTE = app.dataset.route, ADDR = app.dataset.addr;
const HORIZON = 183; // Запись открыта примерно на полгода вперёд
const state = { step: 0, len: 1, chosen: new Set(), person: null, pref: false, days: [], month: null, time: null, windows: new Set(), assigned: null, code: null };
const KEY = 'kamm:booking:v2';

/* ---------- утилиты ---------- */
const mins = (n) => (n >= 60 ? `${Math.floor(n / 60)} Std.${n % 60 ? ` ${n % 60} Min.` : ''}` : `${n} Min.`);
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dayIdx = (d) => (d.getDay() + 6) % 7;
const tidy = (st, ...v) => String.raw({ raw: st }, ...v).replace(/\.\./g, '.');
const dateShort = (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const dateLong = (d) => d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
// Демо-занятость: стабильна для дня, времени и мастера, примерно треть занята
const busy = (d, m, who) => { let h = 2166136261; for (const c of `${d.toDateString()}|${m}|${who}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 100 < 34; };

const svcs = $$('.svc');
const items = () => svcs.filter((b) => state.chosen.has(b.dataset.key)).map((b) => ({
  key: b.dataset.key, cat: b.dataset.cat, name: b.dataset.name,
  price: JSON.parse(b.dataset.price)[state.len], min: JSON.parse(b.dataset.min)[state.len], consult: !!b.dataset.consult,
}));
const total = () => items().reduce((a, i) => a + i.price, 0);
const dur = () => items().reduce((a, i) => a + i.min, 0);
const isRequest = () => items().some((i) => i.consult) || dur() > MAX_DIRECT;
const needSkills = () => [...new Set(items().map((i) => i.cat))];
const eligible = () => team.filter((p) => needSkills().every((s) => p.skills.includes(s)));
const personName = (id) => team.find((p) => p.id === id)?.name.split(' ')[0];

/* ---------- плавные числа в нижней панели ---------- */
const tween = (el, to, format) => {
  const from = Number(el.dataset.v || 0); el.dataset.v = String(to);
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const tick = (t) => { const p = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - p, 3); el.textContent = format(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

/* ---------- шаг 0: услуги ---------- */
const renderServices = () => {
  for (const b of svcs) {
    const p = JSON.parse(b.dataset.price)[state.len], m = JSON.parse(b.dataset.min)[state.len];
    $('.price', b).textContent = `${p} €`; $('.dur', b).textContent = mins(m);
    b.setAttribute('aria-pressed', String(state.chosen.has(b.dataset.key)));
  }
  for (const c of $$('.cat')) {
    const n = svcs.filter((b) => b.dataset.cat === c.dataset.cat && state.chosen.has(b.dataset.key)).length;
    const el = $('.count', c); el.textContent = n || ''; el.classList.toggle('has', n > 0);
  }
};
$$('.len [data-len]').forEach((b) => b.addEventListener('click', () => {
  state.len = Number(b.dataset.len);
  $$('.len [data-len]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  renderServices(); update();
}));
const openCat = (id, toggle = false) => {
  for (const c of $$('.cat')) {
    const h = $('.cat-head', c), on = c.dataset.cat === id;
    h.setAttribute('aria-expanded', String(on ? (toggle ? h.getAttribute('aria-expanded') !== 'true' : true) : false));
  }
  stage(id);
};
$$('.cat').forEach((c) => {
  const h = $('.cat-head', c);
  h.addEventListener('click', () => openCat(c.dataset.cat, true));
  h.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') stage(c.dataset.cat); });
});
svcs.forEach((b) => b.addEventListener('click', () => {
  if (b.classList.contains('off')) { toast(`${personName(state.person)} bietet das nicht an. Entfernen Sie den Wunsch oben oder wählen Sie etwas anderes.`); return; }
  const k = b.dataset.key;
  state.chosen.has(k) ? state.chosen.delete(k) : state.chosen.add(k);
  state.time = null; state.days = []; state.windows.clear();
  if (state.person && state.person !== 'any' && !eligible().some((p) => p.id === state.person)) { state.person = null; state.pref = false; }
  renderServices(); renderPref(); update();
}));

/* ---------- пожелание мастера (из «Team» и «Arbeiten») ---------- */
const prefPerson = () => (state.pref && state.person && state.person !== 'any' ? team.find((p) => p.id === state.person) : null);
const renderPref = () => {
  const p = prefPerson();
  $('.pref').hidden = !p;
  if (p) $('.pref-name').textContent = p.name.split(' ')[0];
  for (const b of svcs) { const off = !!p && !p.skills.includes(b.dataset.cat); b.classList.toggle('off', off); b.setAttribute('aria-disabled', String(off)); }
  for (const c of $$('.cat')) c.classList.toggle('off', !!p && !p.skills.includes(c.dataset.cat));
};
$('.pref-x').addEventListener('click', () => { state.pref = false; state.person = null; state.days = []; state.time = null; renderPref(); update(); });

/* ---------- шаг 1: мастер ---------- */
const people = $$('.person');
const renderPeople = () => {
  const ok = new Set(eligible().map((p) => p.id));
  for (const b of people) {
    const id = b.dataset.person;
    b.disabled = id !== 'any' && !ok.has(id);
    b.setAttribute('aria-pressed', String(state.person === id));
  }
};
const keyOf = (id) => (id && id !== 'any' ? id : 'salon');
people.forEach((b) => {
  b.addEventListener('click', () => { state.person = b.dataset.person; state.pref = false; state.days = []; state.time = null; stage(keyOf(state.person)); renderPeople(); update(); });
  // Подсветка по наведению только для мыши: на тачскринах pointerenter срабатывает вместе с касанием и путает кадры
  b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !b.disabled) stage(keyOf(b.dataset.person)); });
  b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') stage(keyOf(state.person)); });
});

/* ---------- шаг 2: время ---------- */
const who = () => (state.person === 'any' ? eligible().map((p) => p.id) : [state.person]);
const freeFor = (d, m) => who().find((id) => {
  for (let t = m; t < m + dur(); t += SLOT) if (busy(d, t, id)) return false;
  return true;
});
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const dayOk = (day) => {
  const diff = Math.round((day - today0()) / 864e5);
  if (diff < 0 || diff > HORIZON) return false;
  const h = hours[dayIdx(day)];
  if (!h.open) return false;
  if (diff === 0) { const n = new Date(); if (isRequest() || toMin(h.close) - dur() <= n.getHours() * 60 + n.getMinutes() + 30) return false; }
  return true;
};
const firstOk = () => { for (let i = 0; i <= HORIZON; i++) { const d = today0(); d.setDate(d.getDate() + i); if (dayOk(d)) return d; } return today0(); };
const monthOf = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const renderDays = () => {
  const t = today0(), grid = $('.cal-grid'); grid.innerHTML = '';
  if (!state.month) state.month = monthOf(state.days[0] ?? firstOk());
  const m = state.month, last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  $('.cal-title').textContent = m.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const lim = new Date(t); lim.setDate(lim.getDate() + HORIZON);
  $('.cal-nav[data-dir="-1"]').disabled = m <= monthOf(t);
  $('.cal-nav[data-dir="1"]').disabled = m >= monthOf(lim);
  for (let i = 0; i < dayIdx(m); i++) grid.append(Object.assign(document.createElement('span'), { className: 'pad' }));
  for (let n = 1; n <= last; n++) {
    const day = new Date(m.getFullYear(), m.getMonth(), n);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = String(n);
    b.disabled = !dayOk(day);
    if (sameDay(day, t)) b.classList.add('today');
    b.setAttribute('aria-label', dateLong(day));
    b.setAttribute('aria-pressed', String(state.days.some((x) => sameDay(x, day))));
    b.addEventListener('click', () => {
      const sel = state.days.some((x) => sameDay(x, day));
      if (isRequest()) {
        if (sel) state.days = state.days.filter((x) => !sameDay(x, day));
        else if (state.days.length < 3) state.days.push(day);
      } else { state.days = [day]; state.time = null; }
      renderDays(); if (!isRequest()) { renderSlots(); nudgeToSlots(); } update();
    });
    grid.append(b);
  }
};
// На телефоне после выбора дня подвигаем страницу, чтобы время было видно без поиска
const nudgeToSlots = () => {
  const r = $('.slots').getBoundingClientRect();
  if (r.top > innerHeight * 0.6) window.scrollBy({ top: r.top - innerHeight * 0.4, behavior: 'smooth' });
};
$$('.cal-nav').forEach((b) => b.addEventListener('click', () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(b.dataset.dir), 1); renderDays();
}));
const renderSlots = () => {
  const box = $('.slots'); box.innerHTML = '';
  $('.need').textContent = mins(dur());
  $('.who').textContent = state.person === 'any' ? 'allen' : personName(state.person);
  const day = state.days[0];
  if (!day) { box.innerHTML = '<p class="empty">Bitte zuerst einen Tag wählen.</p>'; return; }
  const h = hours[dayIdx(day)], now = new Date(), isToday = day.toDateString() === now.toDateString();
  const groups = [['Vormittag', 0, 720], ['Mittag', 720, 900], ['Nachmittag & Abend', 900, 1440]];
  let any = false;
  for (const [label, a, z] of groups) {
    const grid = document.createElement('div'); grid.className = 'grid';
    for (let m = Math.max(toMin(h.open), a); m < z && m + dur() <= toMin(h.close); m += SLOT) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = fmt(m);
      const free = freeFor(day, m);
      b.disabled = !free || (isToday && m < now.getHours() * 60 + now.getMinutes() + 30);
      if (!b.disabled) any = true;
      b.setAttribute('aria-pressed', String(state.time === fmt(m)));
      b.addEventListener('click', () => { state.time = fmt(m); state.assigned = free; $$('.slots button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); update(); });
      grid.append(b);
    }
    if (!grid.children.length) continue;
    const g = document.createElement('div'); g.className = 'grp';
    g.innerHTML = `<span>${label}</span>`; g.append(grid); box.append(g);
  }
  if (!any) box.innerHTML = '<p class="empty">An diesem Tag ist leider alles belegt. Ein anderer Tag?</p>';
};
$$('.windows button').forEach((b) => b.addEventListener('click', () => {
  const w = b.dataset.w; state.windows.has(w) ? state.windows.delete(w) : state.windows.add(w);
  b.setAttribute('aria-pressed', String(state.windows.has(w))); update();
}));

/* ---------- шаг 3: форма ---------- */
const form = $('.form');
const fields = $$('input, textarea', form);
const errOf = (f) => $(`#e-${f.id.replace('f-', '')}`, form);
const validate = (focusFirst) => {
  let first = null;
  for (const f of fields) {
    const e = errOf(f); if (!e) continue;
    const empty = f.type === 'checkbox' ? !f.checked : (f.required && !f.value.trim());
    const bad = empty || (f.value.trim() && !f.checkValidity());
    f.setAttribute('aria-invalid', String(!!bad)); e.hidden = !bad;
    if (bad && !first) first = f;
  }
  if (first && focusFirst) first.focus();
  return !first;
};
form.addEventListener('input', (e) => { e.target.classList?.remove('invalid'); if (e.target.getAttribute?.('aria-invalid') === 'true') validate(false); update(); });
form.addEventListener('change', (e) => { if (e.target.getAttribute?.('aria-invalid') === 'true') validate(false); });
form.addEventListener('submit', (e) => e.preventDefault());

/* ---------- навигация ---------- */
const ok = () => [
  state.chosen.size > 0,
  !!state.person && (state.person === 'any' || eligible().some((p) => p.id === state.person)),
  isRequest() ? state.days.length > 0 && state.windows.size > 0 : !!state.time,
  true,
][state.step];

const labels = ['Weiter zum Stylisten', 'Weiter zur Zeit', 'Weiter', null];
const nextLabel = () => (state.step === 0 && prefPerson() ? 'Weiter zur Zeit' : labels[state.step]);
const update = () => {
  app.classList.toggle('is-request', isRequest());
  const its = items();
  $('.sum-items').textContent = its.length ? its.map((i) => i.name).join(' + ') : 'Noch nichts gewählt';
  tween($('.t-min'), dur(), (v) => mins(v));
  tween($('.t-price'), total(), (v) => `${isRequest() && v ? 'ab ' : ''}${v} €`);
  const rl = $('.recap-list'); rl.innerHTML = '';
  for (const i of its) { const li = document.createElement('li'); li.textContent = `${i.name} · ${i.price} €`; rl.append(li); }
  const when = isRequest()
    ? (state.days.length ? `Wunschtage: ${state.days.map(dateShort).join(', ')}${state.windows.size ? ', ' + [...state.windows].join(' / ') : ''}` : '')
    : (state.days[0] && state.time ? `${dateShort(state.days[0])}, ${state.time} Uhr` : '');
  if (when) { const li = document.createElement('li'); li.textContent = when; rl.append(li); }
  $('.recap-sum strong').textContent = `${isRequest() && total() ? 'ab ' : ''}${total()} €`;
  const next = $('.next');
  next.disabled = !ok();
  save();
  next.innerHTML = `${state.step === 3 ? (isRequest() ? 'Anfrage senden' : 'Verbindlich buchen') : nextLabel()} <span aria-hidden="true">→</span>`;
};

const views = $$('.view');
const go = (n, push = true, scroll = true) => {
  const dir = n < state.step ? 'from-left' : '';
  state.step = n;
  views.forEach((v) => {
    const on = Number(v.dataset.view) === n;
    v.hidden = !on;
    if (on) { v.classList.remove('from-left'); void v.offsetWidth; if (dir) v.classList.add(dir); }
  });
  $$('.progress li').forEach((li, i) => li.classList.toggle('on', i <= Math.min(n, 3)));
  $('.stepnum').textContent = `${Math.min(n + 1, 4)}/4`;
  $('.back').hidden = n === 0 || n === 4;
  app.classList.toggle('is-done', n === 4);
  if (n === 0) stage($('.cat-head[aria-expanded="true"]')?.closest('.cat')?.dataset.cat ?? 'salon');
  if (n === 0) renderPref();
  if (n === 1) { renderPeople(); stage(keyOf(state.person)); }
  if (n === 2) { if (!state.days.length) state.month = null; renderDays(); renderSlots(); }
  if (push) history.pushState({ step: n }, '');
  update();
  if (scroll) {
    if (innerWidth <= 900) app.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
    if (n > 0) setTimeout(() => views[n].querySelector('h2')?.focus?.({ preventScroll: true }), 50);
  }
};
views.forEach((v) => v.querySelector('h2')?.setAttribute('tabindex', '-1'));
history.replaceState({ step: 0 }, '');
addEventListener('popstate', (e) => { const n = e.state?.step ?? 0; if (n !== state.step && state.step !== 4) go(Math.min(n, 3), false); });

$('.back').addEventListener('click', () => history.back());
$('.next').addEventListener('click', () => {
  if (state.step === 3) {
    if (!validate(true)) return;
    return finish();
  }
  if (ok()) go(state.step === 0 && prefPerson() ? 2 : state.step + 1);
});

/* ---------- билет и календарь ---------- */
let icsBody = '';
const p2 = (n) => String(n).padStart(2, '0');
const local = (x) => `${x.getFullYear()}${p2(x.getMonth() + 1)}${p2(x.getDate())}T${p2(x.getHours())}${p2(x.getMinutes())}00`;
const utc = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const renderTicket = () => {
  const f = Object.fromEntries(new FormData(form));
  const its = items(), first = String(f.name || '').trim().split(' ')[0] || 'Gast';
  const stylist = state.person === 'any' ? personName(state.assigned) : personName(state.person);
  state.code ||= `KAMM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  $('.t-list').innerHTML = '';
  for (const i of its) { const li = document.createElement('li'); li.textContent = `${i.name} · ${i.price} €`; $('.t-list').append(li); }
  $('.t-total').textContent = `${isRequest() ? 'ab ' : ''}${total()} €`;
  $('.t-code').textContent = state.code;
  $('.route').href = ROUTE;
  const calBtns = [$('.gcal'), $('.ics')];
  if (isRequest()) {
    $('.done-title').textContent = `Danke, ${first}. Wir melden uns.`;
    $('.t-kicker').textContent = 'Terminanfrage';
    $('.t-when').textContent = `${state.days.map(dateLong).join(', ')} · ${[...state.windows].join(' / ')}`;
    $('.t-note').textContent = tidy`${state.person === 'any' ? 'Wir' : stylist} rufen Sie innerhalb von 24 Stunden unter ${f.tel} an und schlagen einen Termin vor. Dauer ca. ${mins(dur())}.`;
    calBtns.forEach((b) => (b.hidden = true));
    return;
  }
  const d = state.days[0], [h, m] = state.time.split(':').map(Number);
  const start = new Date(d); start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + dur() * 60000);
  const title = `Studio Kamm: ${its.map((i) => i.name).join(' + ')}`;
  $('.done-title').textContent = `Bis bald, ${first}.`;
  $('.t-kicker').textContent = `Termin bei ${stylist}`;
  $('.t-when').textContent = `${dateLong(d)}, ${state.time} Uhr`;
  $('.t-note').textContent = tidy`Dauer ca. ${mins(dur())}. ${ADDR}, Hannover-Linden. Absagen bis 24 Stunden vorher kostenlos.`;
  icsBody = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Studio Kamm//Demo//DE', 'BEGIN:VEVENT', `UID:${state.code}@studio-kamm.de`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`,
    `SUMMARY:${title}`, `LOCATION:${ADDR.replace(/,/g, '\\,')}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Termin bei Studio Kamm', 'TRIGGER:-PT1H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  $('.gcal').href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${local(start)}/${local(end)}&ctz=Europe/Berlin&location=${encodeURIComponent(ADDR)}`;
  calBtns.forEach((b) => (b.hidden = false));
};
// .ics: на телефоне через системное «Поделиться» (открывается в Календаре), на компьютере обычная загрузка
$('.ics').addEventListener('click', async () => {
  const file = new File([icsBody], 'termin-studio-kamm.ics', { type: 'text/calendar' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Termin bei Studio Kamm' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file), a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
});
const finish = () => { renderTicket(); go(4); };
$('.restart').addEventListener('click', () => {
  form.reset(); fields.forEach((f) => { f.removeAttribute('aria-invalid'); const e = errOf(f); if (e) e.hidden = true; }); Object.assign(state, { chosen: new Set(), person: null, pref: false, days: [], month: null, time: null, assigned: null, code: null }); state.windows.clear();
  $$('.windows button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  try { sessionStorage.removeItem(KEY); } catch {}
  renderServices(); renderPref(); go(0);
});

/* ---------- связь с выезжающими панелями ---------- */
window.addEventListener('kamm:pick-cat', (e) => { if (state.step !== 0) go(0); openCat(e.detail); $(`.cat[data-cat="${e.detail}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' }); });
const toast = (msg) => {
  const t = $('.toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 4200);
};
window.addEventListener('kamm:prefer', (e) => {
  const id = e.detail, name = personName(id), p = team.find((x) => x.id === id);
  if (state.chosen.size && !items().every((i) => p.skills.includes(i.cat))) {
    toast(`${name} bietet nicht alles aus Ihrer Auswahl an. Ändern Sie die Auswahl oder wählen Sie jemand anderen.`);
    if (state.step !== 0) go(0);
    return;
  }
  state.person = id; state.pref = true; state.days = []; state.time = null;
  if (state.chosen.size) { go(2); return; }       // Leistung уже выбрана: сразу ко времени у этого мастера
  if (state.step !== 0) go(0);
  renderPref(); stage(id); update();
  toast(`Sie buchen bei ${name}. Wählen Sie jetzt Ihre Leistung.`);
});

/* ---------- сохранение: обновление страницы не сбрасывает запись ---------- */
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      step: state.step, len: state.len, chosen: [...state.chosen], person: state.person, pref: state.pref,
      days: state.days.map(iso), time: state.time, windows: [...state.windows], assigned: state.assigned, code: state.code,
      form: Object.fromEntries([...new FormData(form)].filter(([k]) => k !== 'privacy')), // согласие не сохраняем
    }));
  } catch {}
}
const restore = () => {
  let j; try { j = JSON.parse(sessionStorage.getItem(KEY)); } catch {}
  if (!j) return 0;
  const keys = new Set(svcs.map((b) => b.dataset.key));
  state.len = [0, 1, 2].includes(j.len) ? j.len : 1;
  $$('.len [data-len]').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.len) === state.len)));
  state.chosen = new Set((j.chosen || []).filter((k) => keys.has(k)));
  state.person = j.person === 'any' || team.some((p) => p.id === j.person) ? j.person : null;
  if (state.person && state.person !== 'any' && !eligible().some((p) => p.id === state.person)) state.person = null;
  state.pref = !!j.pref && !!state.person && state.person !== 'any';
  state.days = (j.days || []).map((s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }).filter((d) => dayOk(d) || isRequest() && d >= today0());
  state.windows = new Set(j.windows || []);
  state.assigned = j.assigned; state.code = j.code;
  state.time = j.time || null;
  for (const [k, v] of Object.entries(j.form || {})) { const el = form.elements[k]; if (!el) continue; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }
  $$('.windows button').forEach((b) => b.setAttribute('aria-pressed', String(state.windows.has(b.dataset.w))));
  let step = Math.min(Number(j.step) || 0, 4);
  if (!state.chosen.size) step = 0;
  else if (step >= 2 && !state.person) step = 1;
  const timeOk = isRequest() ? state.days.length > 0 && state.windows.size > 0 : !!state.time && state.days.length > 0;
  if (step >= 3 && !timeOk) step = 2;
  if (step === 4 && !state.code) step = 3;
  return step;
};

renderServices();
const start = restore();
renderServices(); renderPref();
history.replaceState({ step: start }, '');
if (start === 4) renderTicket();
go(start, false, false);
