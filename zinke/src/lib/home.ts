/** Startseite: Status offen/geschlossen, Montage-Szene nach Scroll, Werkstoff-Probe, PLZ-Prüfung, klebende Leiste. */
import site from '../data/site.json';
import { PRESETS, clone, normalize, width, type Cfg } from './model';
import { sketch } from './sketch';
import { zoneFor } from './zone';
import type { WerkScene } from './scene';

const $ = <T extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const BASE = document.querySelector<HTMLElement>('[data-base]')?.dataset.base || '/';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const weak = ((navigator as any).deviceMemory && (navigator as any).deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

/* ---- fehlende Bilder: Ersatz oder ausblenden (Fotos kommen später in public/img) ---- */
function fixImg(img: HTMLImageElement) {
  if (img.dataset.fixed) return;
  const fb = img.dataset.fb;
  if (fb && !img.src.endsWith(fb)) { img.src = BASE + fb; return; }
  img.dataset.fixed = '1'; img.classList.add('is-missing');
}
document.addEventListener('error', (e) => { if (e.target instanceof HTMLImageElement) fixImg(e.target); }, true);
$$<HTMLImageElement>('img').forEach((i) => { if (i.complete && i.naturalWidth === 0) fixImg(i); });

/* ---- Status offen/geschlossen (Europa/Berlin) ---- */
(function status() {
  const els = $$('[data-status], [data-status-m]'); if (!els.length) return;
  const parts = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const day = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'].indexOf(g('weekday'));
  const now = Number(g('hour')) * 60 + Number(g('minute'));
  const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const today = site.hours.find((h) => h.days.includes(day));
  let text = '', open = false;
  if (today && now >= mins(today.open) && now < mins(today.close)) { open = true; text = `Werkstatt offen bis ${today.close} Uhr`; }
  else {
    for (let k = 0; k < 7; k++) {
      const d = (day + k) % 7, h = site.hours.find((x) => x.days.includes(d));
      if (h && (k > 0 || (today && now < mins(h.open)))) { text = `Werkstatt geschlossen, öffnet ${k === 0 ? 'heute' : k === 1 ? 'morgen' : ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d]} ${h.open} Uhr`; break; }
    }
  }
  els.forEach((el) => { el.textContent = text; el.dataset.open = open ? '1' : '0'; el.removeAttribute('aria-hidden'); });
})();

/* ---- Menü schließen bei Klick ---- */
$$('[data-menu] a').forEach((a) => a.addEventListener('click', () => $<HTMLDetailsElement>('[data-menu]')!.removeAttribute('open')));

/* ---- klebende Leiste ausblenden, wenn Formular im Bild ---- */
const bar = $('[data-bar]'), form = $('#anfrage');
if (bar && form && 'IntersectionObserver' in window) new IntersectionObserver((es) => { bar.classList.toggle('is-off', es.some((e) => e.isIntersecting)); }, { threshold: 0.12 }).observe(form);

/* ---- PLZ-Prüfung (Einsatzgebiet) ---- */
const pf = $<HTMLFormElement>('[data-plz-form]');
if (pf) {
  const inp = pf.querySelector<HTMLInputElement>('input')!, out = $('[data-plz-answer]')!;
  const run = () => { const z = zoneFor(inp.value.trim()); out.textContent = z ? z.text : 'Bitte fünf Ziffern eingeben.'; if (z) out.dataset.z = z.z; else delete out.dataset.z; };
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 5); const z = zoneFor(inp.value); out.textContent = z ? z.text : ''; if (z) out.dataset.z = z.z; else delete out.dataset.z; });
  pf.addEventListener('submit', (e) => { e.preventDefault(); run(); });
}

/* ---- Werkstoff-Probe (Dialog) ---- */
const dlg = $<HTMLDialogElement>('[data-holz-dialog]');
$$('[data-holz]').forEach((b) => b.addEventListener('click', () => {
  if (!dlg) return;
  const img = dlg.querySelector<HTMLImageElement>('img')!;
  img.classList.remove('is-missing'); delete img.dataset.fixed;
  img.dataset.fb = 'tex/' + b.dataset.tex; img.src = BASE + 'img/' + b.dataset.photo; img.alt = `Probe ${b.dataset.name}, Draufsicht auf ein geöltes Brett`;
  dlg.querySelector('[data-h-name]')!.textContent = b.dataset.name!;
  dlg.querySelector('[data-h-art]')!.textContent = b.dataset.art!;
  dlg.querySelector('[data-h-fuer]')!.textContent = b.dataset.fuer!;
  dlg.showModal?.();
}));
$('[data-holz-close]')?.addEventListener('click', () => dlg?.close?.());
dlg?.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

/* ---- Referenz-Links in den Konstruktor / Formular vorbelegen: übernimmt data-was in AnfrageForm ---- */

/* ---- Montage-Szene ---- */
const sz = $('[data-sz]');
if (sz) {
  const track = sz.querySelector<HTMLElement>('[data-track]')!, stage = sz.querySelector<HTMLElement>('[data-sz-stage]')!;
  const svgBox = sz.querySelector<HTMLElement>('[data-sz-svg]')!, canvas = sz.querySelector<HTMLCanvasElement>('[data-sz-canvas]')!;
  const photo = sz.querySelector<HTMLImageElement>('[data-sz-photo]')!;
  const capt = sz.querySelector<HTMLElement>('[data-sz-capt]')!, note = sz.querySelector<HTMLElement>('[data-sz-note]')!;
  const lbl = { b: sz.querySelector<HTMLElement>('[data-lbl-b]')!, h: sz.querySelector<HTMLElement>('[data-lbl-h]')!, d: sz.querySelector<HTMLElement>('[data-lbl-d]')! };
  const prods = JSON.parse(sz.dataset.prods || '[]') as { id: string; label: string; preset: string; photo: string; alt: string; caption: string; price: string }[];
  let cur = prods[0], cfg: Cfg = normalize(clone(PRESETS[cur.preset]));
  let scene: WerkScene | null = null, p = 0, photoOk = true, started = false, staticMode = reduced;
  const link = capt.querySelector<HTMLAnchorElement>('[data-sz-link]')!;

  const setProduct = (id: string) => {
    cur = prods.find((x) => x.id === id) || prods[0]; cfg = normalize(clone(PRESETS[cur.preset]));
    photoOk = true; photo.classList.remove('is-missing'); delete photo.dataset.fixed; photo.removeAttribute('data-fb');
    photo.src = BASE + 'img/' + cur.photo; photo.alt = cur.alt;
    svgBox.innerHTML = sketch(cfg, 'wood', { marks: true });
    capt.querySelector('[data-sz-name]')!.textContent = cur.label;
    capt.querySelector('[data-sz-cap]')!.textContent = cur.caption;
    capt.querySelector('[data-sz-price]')!.textContent = cur.price;
    link.href = `${BASE}konstruktor/?v=${cur.preset}`;
    $$('[data-prod]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.prod === cur.id)));
    scene?.setConfig(cfg, false); scene?.setProgress(Math.min(1, p / 0.72));
    paint();
  };
  photo.addEventListener('error', () => { photoOk = false; paint(); });
  photo.addEventListener('load', () => { photoOk = true; paint(); });

  function paint() {
    if (staticMode) { photo.style.opacity = ''; svgBox.style.opacity = ''; canvas.style.display = 'none'; capt.classList.add('is-on'); return; }
    const asm = Math.min(1, p / 0.72);
    const mix = Math.max(0, Math.min(1, (p - 0.8) / 0.15));
    scene?.setProgress(asm);
    photo.style.opacity = String(photoOk ? mix : 0);
    canvas.style.opacity = scene ? String(photoOk ? 1 - mix * 0.9 : 1) : '0';
    svgBox.style.opacity = scene ? '0' : (staticMode ? '1' : '0.38');
    capt.classList.toggle('is-on', p > 0.88 || staticMode);
    note.classList.toggle('is-off', p > 0.04);
    labels();
  }
  function labels() {
    if (!scene) return;
    const asm = Math.min(1, p / 0.72), mix = Math.max(0, Math.min(1, (p - 0.8) / 0.15));
    const place = (el: HTMLElement, name: 'breite' | 'hoehe' | 'duebel', on: boolean) => {
      const a = on ? scene!.anchor(name) : null;
      el.style.opacity = a && a.visible ? '1' : '0';
      if (a && a.visible) el.style.transform = `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px) translate(-50%, -50%)`;
    };
    const keep = !photoOk || mix < 0.3;
    place(lbl.b, 'breite', asm > 0.97 && keep); place(lbl.h, 'hoehe', asm > 0.97 && keep); place(lbl.d, 'duebel', asm > 0.1 && asm < 0.6);
  }
  const onScroll = () => {
    const r = track.getBoundingClientRect(), vh = innerHeight;
    p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - vh)));
    paint();
  };
  const fillLabels = () => { lbl.b.textContent = `${width(cfg as any) || (cfg as any).l} cm`; lbl.h.textContent = `${(cfg as any).h || 75} cm`; };

  $$('[data-prod]').forEach((b) => b.addEventListener('click', () => { setProduct(b.dataset.prod!); fillLabels(); }));
  setProduct(cur.id); fillLabels();

  if (staticMode) { sz.classList.add('sz--static'); paint(); }
  else {
    addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); onScroll();
    const start = async () => {
      if (started) return; started = true;
      try {
        const mod = await import('./scene');
        if (!mod.hasWebGL()) throw new Error('kein WebGL');
        scene = await mod.createScene({
          canvas, base: BASE, mode: 'assembly', lowPower: !!weak, noFx: true, maxYaw: 12,
          onFrame: () => labels(),
          onSlow: () => { staticMode = true; sz.classList.add('sz--static'); scene?.dispose(); scene = null; canvas.style.display = 'none'; paint(); },
        });
        scene.setConfig(cfg, false); fillLabels(); paint();
      } catch { staticMode = true; sz.classList.add('sz--static'); paint(); }
    };
    if ('IntersectionObserver' in window) new IntersectionObserver((es, o) => { if (es.some((e) => e.isIntersecting)) { start(); o.disconnect(); } }, { rootMargin: '120% 0px' }).observe(sz);
    else start();
  }
}
