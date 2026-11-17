// Прокрутка → высота. От высоты зависят сцена, лента альтиметра, приборы и видимость станций.
import { APEX, altAt, horizon, pressure, temperature, tplus } from './atmosphere';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const root = document.documentElement;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

root.classList.add('js');
history.scrollRestoration = 'manual';
if (!location.hash) scrollTo(0, 0);

const ascent = $('#ascent');
const stations = [...document.querySelectorAll<HTMLElement>('.station')];
const N = stations.length - 1;
const scale = $('#tapeScale');
const odoCols = [...document.querySelectorAll<HTMLElement>('.odo__strip')];
const gTime = $('#gTime'), gTemp = $('#gTemp'), gPress = $('#gPress'), gHor = $('#gHor');
const PX_KM = 130; // пикселей ленты на километр

document.querySelectorAll<HTMLElement>('.tape__km').forEach((e) => { e.style.bottom = `${Number(e.dataset.km) * PX_KM}px`; });
scale.style.height = `${(APEX / 1000) * PX_KM}px`;

let target = 0, alt = 0, p = 0, post = 0, yaw = 0, yawTo = 0;

function measure() {
  const r = ascent.getBoundingClientRect();
  const span = r.height - innerHeight;
  p = Math.min(1, Math.max(0, -r.top / span)); if (p > 0.9995) p = 1;
  target = altAt(p);
  post = Math.min(1, Math.max(0, (-r.top - span) / (innerHeight * 0.7)));
}

const setText = (el: HTMLElement, v: string) => { if (el.textContent !== v) el.textContent = v; };

function paint() {
  // лента и счётчик
  scale.style.transform = `translate3d(0, ${(alt / 1000) * PX_KM}px, 0)`;
  const v = Math.round(alt / 5) / 2; // младший разряд счётчика: десятки метров
  let carry = Math.max(0, (v % 1 - 0.7) / 0.3); // разряд стоит на месте и проворачивается только в конце шага
  for (let k = 0; k < 4; k++) {
    const d = Math.floor(v / 10 ** k) % 10;
    const roll = carry;
    odoCols[3 - k].style.transform = `translate3d(0, ${-(d + roll) * 1.5}em, 0)`;
    carry = d === 9 ? roll : 0;
  }
  const m = Math.round(alt);
  setText(gTime, tplus(m));
  const t = Math.round(temperature(m));
  setText(gTemp, `${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)} °C`);
  setText(gPress, `${Math.round(pressure(m))} hPa`);
  setText(gHor, `${Math.round(horizon(m))} km`);

  // станции: видна та, чья высота сейчас в центре
  stations.forEach((s, i) => {
    const d = Math.abs(p * N - i);
    let o = 1 - Math.min(1, Math.max(0, (d - 0.2) / 0.22));
    if (i === N && p >= 1) o = Math.max(0, 1 - post * 3); // уходит раньше, чем первый лист доезжает до текста
    s.style.opacity = o.toFixed(3);
    s.style.visibility = o < 0.02 ? 'hidden' : 'visible';
    if (!still) (s.firstElementChild as HTMLElement).style.transform = `translate3d(0, ${((i - p * N) * 120).toFixed(1)}px, 0)`;
  });
  root.style.setProperty('--alt', (alt / APEX).toFixed(4));
  root.style.setProperty('--post', post.toFixed(3));
  root.classList.toggle('is-post', post > 0.5);
}

let prev = performance.now();
function tick(now: number) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  measure();
  alt = still ? target : alt + (target - alt) * (1 - Math.exp(-dt * 7));
  if (Math.abs(target - alt) < 0.5) alt = target;
  yaw += (yawTo - yaw) * (1 - Math.exp(-dt * 6));
  paint();
  requestAnimationFrame(tick);
}
measure(); alt = target; paint();
requestAnimationFrame(tick);

// ── сцена ────────────────────────────────────────────────────────────────────
const canvas = $('#sky') as unknown as HTMLCanvasElement;
import('./scene').then(({ initScene }) => {
  if (!initScene(canvas, () => ({ alt, yaw, post }), still)) { root.classList.add('no-gl'); canvas.dataset.live = '0'; }
}).catch(() => { root.classList.add('no-gl'); canvas.dataset.live = '0'; });

// на потолке: провести пальцем в сторону, чтобы осмотреться
let dragX: number | null = null, dragY = 0, dragYaw = 0;
addEventListener('pointerdown', (e) => { if (p > 0.97 && post < 0.3) { dragX = e.clientX; dragY = e.clientY; dragYaw = yawTo; } });
addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  const dx = e.clientX - dragX;
  if (Math.abs(dx) > Math.abs(e.clientY - dragY)) yawTo = Math.max(-170, Math.min(170, dragYaw - dx * 0.35));
});
const drop = () => { dragX = null; };
addEventListener('pointerup', drop); addEventListener('pointercancel', drop);

// ── план полёта ──────────────────────────────────────────────────────────────
const plan = $('#plan') as unknown as HTMLDialogElement;
$('.plan-open').addEventListener('click', () => plan.showModal());
$('.plan__close').addEventListener('click', () => plan.close());
plan.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a');
  if (!a) { if (e.target === plan) plan.close(); return; }
  plan.close();
  if (a.dataset.jump !== undefined) {
    e.preventDefault();
    const top = ascent.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (Number(a.dataset.jump) / N) * (ascent.offsetHeight - innerHeight), behavior: still ? 'auto' : 'smooth' });
  }
});

// профиль полёта рисуется, когда появляется на экране
const prof = document.querySelector('.profile');
if (prof) new IntersectionObserver((es, io) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.disconnect(); } }), { threshold: 0.4 }).observe(prof);

// ── бронирование ─────────────────────────────────────────────────────────────
const form = $('#book') as unknown as HTMLFormElement;
const SEAT = Number(form.dataset.seat), CAPSULE = Number(form.dataset.capsule);
const KEY = `form:${location.pathname}:book`;
const windows = [...form.querySelectorAll<HTMLInputElement>('input[name=window]')];
const seats = [...form.querySelectorAll<HTMLInputElement>('input[name=seat]')];
const T = JSON.parse(form.dataset.t!) as Record<string, string>;
const eur = (n: number) => (T.lang === 'en' ? `€${n.toLocaleString(T.locale)}` : `${n.toLocaleString(T.locale)} €`);
const seatsText = (n: number) => (n === seats.length ? T.whole : n === 1 ? T.seat1 : T.seatN.replace('{n}', String(n)));
const picked = () => windows.find((w) => w.checked);
const chosen = () => seats.filter((s) => s.checked).map((s) => s.value);
const total = (n: number) => (n === seats.length ? CAPSULE : n * SEAT);

function applyWindow() {
  const w = picked();
  const taken = w ? w.dataset.taken!.split(',').filter(Boolean) : null;
  seats.forEach((s) => {
    const off = !taken || taken.includes(s.value);
    s.disabled = off; if (off) s.checked = false;
    s.parentElement!.classList.toggle('seat--taken', !!taken && taken.includes(s.value));
  });
  setText($('#cabinHelp'), w ? T.help1.replace('{label}', w.dataset.label!) : T.help0);
}

function summary() {
  const w = picked(), n = chosen().length;
  setText($('#sumWhat'), n && w ? `${seatsText(n)} · ${w.dataset.label}` : w ? T.noSeats : T.noWindow);
  setText($('#sumTotal'), eur(total(n)));
}

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ w: picked()?.value, s: chosen(), name: (form.elements.namedItem('name') as HTMLInputElement).value, email: (form.elements.namedItem('email') as HTMLInputElement).value, tel: (form.elements.namedItem('tel') as HTMLInputElement).value }));
  } catch { /* хранилище недоступно: форма работает без автосохранения */ }
}
function restore() {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (!d) return;
    const w = windows.find((x) => x.value === d.w && !x.disabled); if (w) w.checked = true;
    applyWindow();
    seats.forEach((s) => { if (!s.disabled && d.s?.includes(s.value)) s.checked = true; });
    (form.elements.namedItem('name') as HTMLInputElement).value = d.name || '';
    (form.elements.namedItem('email') as HTMLInputElement).value = d.email || '';
    (form.elements.namedItem('tel') as HTMLInputElement).value = d.tel || '';
  } catch { /* повреждённая запись: начинаем с пустой формы */ }
}

const fail = (id: string, bad: boolean, field?: HTMLElement) => { $(id).hidden = !bad; field?.setAttribute('aria-invalid', String(bad)); return bad; };

form.addEventListener('change', (e) => {
  if ((e.target as HTMLInputElement).name === 'window') { applyWindow(); fail('#errWindow', false); }
  if ((e.target as HTMLInputElement).name === 'seat') fail('#errSeat', false);
  summary(); save();
});
form.addEventListener('input', save);
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = form.elements.namedItem('name') as HTMLInputElement, mail = form.elements.namedItem('email') as HTMLInputElement, ok = form.elements.namedItem('consent') as HTMLInputElement;
  const w = picked(), s = chosen();
  const bad = [
    fail('#errWindow', !w) && windows.find((x) => !x.disabled),
    fail('#errSeat', !!w && !s.length) && seats.find((x) => !x.disabled),
    fail('#errName', name.value.trim().length < 3, name) && name,
    fail('#errMail', !/^\S+@\S+\.\S+$/.test(mail.value.trim()), mail) && mail,
    fail('#errOk', !ok.checked, ok) && ok,
  ].find(Boolean);
  if (bad) { (bad as HTMLElement).focus(); (bad as HTMLElement).scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' }); return; }
  setText($('#pName'), name.value.trim());
  setText($('#pDate'), w!.dataset.label!); setText($('#pLift'), w!.dataset.liftoff!);
  setText($('#pSeats'), s.length === seats.length ? T.whole : s.join(', '));
  setText($('#pTotal'), eur(total(s.length)));
  try { sessionStorage.removeItem(KEY); } catch { /* нечего очищать */ }
  form.hidden = true; const pass = $('#pass'); pass.hidden = false; pass.focus(); pass.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
});
$('#again').addEventListener('click', () => { form.reset(); applyWindow(); summary(); $('#pass').hidden = true; form.hidden = false; form.scrollIntoView({ block: 'start' }); });

restore(); applyWindow(); summary();
