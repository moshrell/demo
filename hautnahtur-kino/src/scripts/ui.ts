// Общая логика всех страниц: шторки, пилюля с итогом, часы работы, медовая нить.
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
// Пилюля прячется, пока на экране свой итог (карточка калькулятора, сводка в форме): сумма не дублируется и не закрывает кнопку
const weg = new Set<Element>();
const io = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting ? weg.add(e.target) : weg.delete(e.target))); pille.classList.toggle('pille--weg', weg.size > 0); }, { rootMargin: '0px 0px -40px 0px' });
$$('[data-pille-weg]').forEach((e) => io.observe(e));
function render() {
  const c = cart.get();
  // на странице записи сводка уже в форме — пилюля не нужна и легла бы на поля
  const show = c.lines.length > 0 && document.body.dataset.leiste !== 'termin';
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
  const k = cart.kombiHint(), kb = $('[data-auswahl-kombi]');
  if (kb) { kb.hidden = !k; if (k) { $('[data-auswahl-kombi-text]')!.textContent = `${k.durch.name} ist günstiger: ${cart.euro(k.durch.preis)} statt ${cart.euro(k.durch.preis + k.spart)}.`; kb.dataset.id = k.durch.id; } }
  $('[data-auswahl-summe]')!.textContent = (c.ab ? 'ab ' : '') + cart.euro(c.summe);
  $('[data-auswahl-dauer]')!.textContent = c.minOk ? 'ca. ' + cart.dauer(c.min) : '';
  if (!c.lines.length) dlg('auswahl')?.close();
}
$('[data-leeren]')?.addEventListener('click', () => cart.clear());
$('[data-auswahl-kombi-ja]')?.addEventListener('click', () => { const id = $('[data-auswahl-kombi]')?.dataset.id; if (id) cart.applyKombi(id); });
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

honig.start();
