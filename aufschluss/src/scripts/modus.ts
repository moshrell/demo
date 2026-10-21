// Zwei Bereiche (Notfall/Vorsorge), umgeschaltet per Schließzylinder (ziehen/tippen), Beschriftungen oder Aktionsleiste.
type Mode = 'notfall' | 'vorsorge';
const root = document.documentElement;
const kern = document.querySelector<SVGGElement>('[data-kern]');
const zyl = document.querySelector<HTMLElement>('[data-zyl]');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ANGLE: Record<Mode, number> = { notfall: 0, vorsorge: 90 };
const mode = (): Mode => (root.dataset.mode === 'vorsorge' ? 'vorsorge' : 'notfall');
const rot = (deg: number) => kern && (kern.style.setProperty('--rot', `${deg}deg`));

function setMode(m: Mode, opts: { scrollTo?: Element | null; push?: boolean } = {}) {
  const changed = m !== mode();
  root.dataset.mode = m;
  document.querySelectorAll<HTMLButtonElement>('[data-mode-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modeBtn === m)));
  document.querySelectorAll<HTMLAnchorElement>('[data-mode-link]').forEach((a) => { a.href = m === 'notfall' ? '#vorsorge' : '#notfall'; });
  root.classList.add('drehen');
  rot(ANGLE[m]);
  if (changed && 'vibrate' in navigator) try { navigator.vibrate(10); } catch {}
  const target = opts.scrollTo;
  const hash = target && target.id && target.id !== 'notfall' ? `#${target.id}` : m === 'vorsorge' ? '#vorsorge' : '';
  try { history.replaceState(null, '', hash || location.pathname); } catch {}
  if (target && target.id !== 'notfall' && target.id !== 'vorsorge') target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  else if (changed) scrollTo({ top: 0, behavior: 'auto' });
}

// Startzustand (Inline-Skript im <head> hat data-mode schon gesetzt)
rot(ANGLE[mode()]);
setMode(mode());
if (location.hash.length > 1) document.getElementById(location.hash.slice(1))?.scrollIntoView();

document.querySelectorAll<HTMLButtonElement>('[data-mode-btn]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.modeBtn as Mode)));

// Alle In-Seiten-Links: Ziel im anderen Bereich? Erst umschalten, dann hinscrollen.
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href')!.slice(1);
  const el = id ? document.getElementById(id) : null;
  const panel = el?.closest<HTMLElement>('[data-mode-panel]');
  if (!el || !panel) return;
  e.preventDefault();
  setMode(panel.dataset.modePanel as Mode, { scrollTo: el });
});

// Zylinder drehen: nach rechts ziehen = Vorsorge, nach links = Notfall. Tippen = umschalten.
if (zyl && kern) {
  let start = 0, base = 0, cur = 0, moved = false, id: number | null = null;
  zyl.addEventListener('pointerdown', (e) => {
    id = e.pointerId; zyl.setPointerCapture(id);
    start = e.clientX; base = ANGLE[mode()]; cur = base; moved = false;
    root.classList.remove('drehen');
  });
  zyl.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - start;
    if (Math.abs(dx) > 4) moved = true;
    cur = Math.max(-15, Math.min(105, base + dx * 1.6));
    rot(cur);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!moved) return setMode(mode() === 'notfall' ? 'vorsorge' : 'notfall');
    const m: Mode = base === 0 ? (cur > 35 ? 'vorsorge' : 'notfall') : (cur < 55 ? 'notfall' : 'vorsorge');
    setMode(m);
  };
  zyl.addEventListener('pointerup', end);
  zyl.addEventListener('pointercancel', end);
}

// Hinweis-Animation einmal pro Sitzung: Kern wackelt nach rechts und zurück
function hint() {
  try { if (sessionStorage.getItem('hint')) return; sessionStorage.setItem('hint', '1'); } catch {}
  const h = document.querySelector<HTMLElement>('[data-hint]');
  if (h) { h.hidden = false; setTimeout(() => (h.hidden = true), 4000); }
  if (reduce || !kern || mode() !== 'notfall') return;
  root.classList.remove('drehen');
  kern.animate([{ rotate: '0deg' }, { rotate: '28deg', offset: 0.35 }, { rotate: '0deg', offset: 0.7 }, { rotate: '10deg', offset: 0.85 }, { rotate: '0deg' }], { duration: 900, delay: 300, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
}
if (root.classList.contains('intro')) root.addEventListener('intro:done', () => setTimeout(hint, 200), { once: true });
else setTimeout(hint, 600);
