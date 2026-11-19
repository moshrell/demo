// Общая логика всех страниц: шторки, пилюля с итогом, часы работы, проба шрифтов, медовая панель.
import * as cart from '../lib/cart';
import { honig } from './honig';
import zeiten from '../data/oeffnungszeiten.json';

try { history.scrollRestoration = 'manual'; } catch {}

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

/* ---------- Шторки (<dialog>) ---------- */
const dlg = (name: string) => $<HTMLDialogElement>(`dialog[data-dialog="${name}"]`);
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const open = t.closest<HTMLElement>('[data-open]');
  if (open) {
    const d = dlg(open.dataset.open!);
    if (d) { $$<HTMLDialogElement>('dialog[open]').forEach((x) => x.close()); d.showModal(); }
    return;
  }
  if (t.closest('[data-close]')) { t.closest('dialog')?.close(); return; }
  if (t instanceof HTMLDialogElement && t.open) {
    // клик по затемнению закрывает
    const r = t.getBoundingClientRect(), ev = e as MouseEvent;
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) t.close();
  }
});

/* ---------- Пилюля и шторка «Ihre Auswahl» ---------- */
const pille = $<HTMLButtonElement>('[data-pille]')!;
function render() {
  const c = cart.get();
  const show = c.lines.length > 0;
  if (pille.hidden === show) { pille.hidden = !show; honig.pulse(); }
  if (show) {
    $('[data-pille-n]')!.textContent = cart.anzahl(c.lines.length);
    $('[data-pille-summe]')!.textContent = (c.ab ? 'ab ' : '') + cart.euro(c.summe);
    pille.setAttribute('aria-label', `Ihre Auswahl: ${cart.anzahl(c.lines.length)}, ${cart.euro(c.summe)}. Öffnen`);
  }
  const liste = $('[data-auswahl-liste]')!;
  liste.replaceChildren(...(c.lines.length ? c.lines.map((l) => {
    const li = document.createElement('li');
    const n = document.createElement('span'); n.textContent = l.name + (l.g === 'herren' ? ' (Herren)' : '');
    const p = document.createElement('span'); p.className = 'preis'; p.textContent = l.gratis ? 'inklusive' : (l.ab ? 'ab ' : '') + cart.euro(l.preis);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '×'; b.setAttribute('aria-label', `${l.name} entfernen`);
    b.addEventListener('click', () => cart.remove(l.id));
    li.append(n, p, b); return li;
  }) : [Object.assign(document.createElement('li'), { className: 'auswahl__leer', textContent: 'Noch nichts ausgewählt.' })]));
  $('[data-auswahl-summe]')!.textContent = (c.ab ? 'ab ' : '') + cart.euro(c.summe);
  $('[data-auswahl-dauer]')!.textContent = c.min ? 'ca. ' + cart.dauer(c.min) : '';
  if (!c.lines.length) dlg('auswahl')?.close();
}
$('[data-leeren]')?.addEventListener('click', () => cart.clear());
window.addEventListener('zf:cart', render);
render();

/* ---------- Часы работы (Europe/Berlin) ---------- */
function berlin() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const tage = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  return { tag: tage.indexOf(p.weekday.replace('.', '')), h: Number(p.hour) + Number(p.minute) / 60 };
}
const span = (z: number[][]) => z.map(([a, b]) => `${a}–${b}`).join(' · ');
function zeitenRender() {
  const { tag, h } = berlin(); if (tag < 0) return;
  const heute = zeiten.tage[tag];
  const offen = heute.zeiten.find(([a, b]) => h >= a && h < b);
  let status: string;
  if (offen) status = `<span class="punkt"></span>Jetzt geöffnet bis ${offen[1]} Uhr`;
  else {
    const spaeter = heute.zeiten.find(([a]) => a > h);
    if (spaeter) status = `<span class="punkt punkt--zu"></span>Geschlossen, öffnet heute um ${spaeter[0]} Uhr`;
    else {
      let i = 1; while (i < 8 && !zeiten.tage[(tag + i) % 7].zeiten.length) i++;
      const t = zeiten.tage[(tag + i) % 7];
      status = `<span class="punkt punkt--zu"></span>Geschlossen, öffnet ${i === 1 ? 'morgen' : 'am ' + t.name} um ${t.zeiten[0][0]} Uhr`;
    }
  }
  const kopf = $('[data-heute]');
  if (kopf) kopf.innerHTML = heute.zeiten.length ? `${offen ? '<span class="punkt"></span>' : ''}Heute <b>${span(heute.zeiten)} Uhr</b>` : `Heute ${heute.hinweis ? '<b>' + heute.hinweis + '</b>' : 'geschlossen'}`;
  $$('[data-status]').forEach((e) => (e.innerHTML = status));
  $$('.woche > div').forEach((d) => d.classList.toggle('heute', Number(d.dataset.tag) === tag));
}
zeitenRender();
setInterval(zeitenRender, 60_000);

/* ---------- Проба шрифтов ---------- */
let geladen = false;
function schriftLaden() {
  if (geladen) return; geladen = true;
  Promise.all([
    import('@fontsource/gilda-display/400.css'), import('@fontsource-variable/manrope/wght.css'),
    import('@fontsource-variable/bricolage-grotesque/wght.css'), import('@fontsource-variable/literata/wght.css'),
  ]).catch(() => {});
}
function schriftSetzen(id: string, merken = true) {
  // держим на месте то, что сейчас посередине экрана
  const anchor = document.elementFromPoint(innerWidth / 2, innerHeight / 3) as HTMLElement | null;
  const before = anchor?.getBoundingClientRect().top ?? 0;
  document.documentElement.dataset.font = id;
  if (merken) { try { localStorage.setItem('zf-schrift', id); } catch {} }
  const u = new URL(location.href); u.searchParams.set('schrift', id); history.replaceState(history.state, '', u);
  const fix = () => { if (anchor?.isConnected) window.scrollBy(0, anchor.getBoundingClientRect().top - before); };
  requestAnimationFrame(fix); document.fonts?.ready.then(fix);
}
const aktuell = document.documentElement.dataset.font || 'a';
// шрифты B–D подгружаются после загрузки страницы, чтобы переключение было мгновенным
if (aktuell !== 'a') schriftLaden(); else addEventListener('load', () => setTimeout(schriftLaden, 1200));
const sPanel = $<HTMLElement>('#schrift-panel'), sKnopf = $<HTMLButtonElement>('[data-schrift-knopf]');
const sZu = () => { if (sPanel && sKnopf) { sPanel.hidden = true; sKnopf.setAttribute('aria-expanded', 'false'); } };
sKnopf?.addEventListener('click', () => { if (!sPanel) return; sPanel.hidden = !sPanel.hidden; sKnopf.setAttribute('aria-expanded', String(!sPanel.hidden)); });
document.addEventListener('click', (e) => { if (sPanel && !sPanel.hidden && !(e.target as Element).closest('[data-schrift]')) sZu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sZu(); });
$$<HTMLInputElement>('input[name="schrift"]').forEach((r) => {
  r.checked = r.value === aktuell;
  r.addEventListener('change', () => { schriftSetzen(r.value); setTimeout(sZu, 250); });
});
// Ссылки внутри сайта несут выбранную пару, чтобы клиентка видела одну и ту же
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  const f = document.documentElement.dataset.font;
  if (!a || !f || f === 'a' || a.origin !== location.origin || a.target) return;
  const u = new URL(a.href); if (!u.searchParams.has('schrift')) { u.searchParams.set('schrift', f); a.href = u.toString(); }
}, true);

honig.start();
