// Heizungs-Baukasten: Zustand, Preis, Auswahl, Zusammenfassung. 3D (heiz3d.ts) lädt erst, wenn die Bühne sichtbar ist.
import data from '../data/anlage.json';
import type { Handle } from './heiz3d';

type St = { anlage: string; speicher: string; zirk: string; abgleich: string };
const KEY = 'kl:heiz';
const ZONES = data.zones.map((z) => z.id) as Array<keyof St>;
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const zoneOf = (id: string) => data.zones.find((z) => z.id === id)!;

function normalize(s: St): St {
  const n = { ...s };
  for (const id of ZONES) if (!zoneOf(id).variants.some((v) => v.id === n[id])) n[id] = zoneOf(id).variants[0].id;
  return n;
}
function load(): St {
  try { const raw = sessionStorage.getItem(KEY); if (raw) return normalize({ ...(data.defaults as St), ...JSON.parse(raw) }); }
  catch (e) { console.error('heiz: Auswahl lesen', e); }
  return { ...(data.defaults as St) };
}
function save(s: St) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.error('heiz: Auswahl speichern', e); } }
const cents = (s: St) => ZONES.reduce((c, id) => c + (zoneOf(id).variants.find((v) => v.id === s[id])?.cents ?? 0), 0);
const label = (id: keyof St, s: St) => zoneOf(id).variants.find((v) => v.id === s[id])!.label;
const rows = (s: St): [string, string][] => ZONES.map((id) => [zoneOf(id).label, label(id, s)]);

function init(root: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = root.querySelector<HTMLElement>('[data-bk-stage]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-bk-canvas]')!;
  const ring = root.querySelector<HTMLButtonElement>('[data-bk-ring]')!;
  const nogl = root.querySelector<HTMLElement>('[data-bk-nogl]')!;
  const totalEls = root.querySelectorAll<HTMLElement>('[data-bk-total]');
  const rowsEl = root.querySelector<HTMLElement>('[data-bk-rows]');
  const barSum = document.querySelector<HTMLElement>('[data-bk-bar-sum]');
  let st = load();
  let scene: Handle | null = null;
  let hinted = true;

  const render = () => {
    root.querySelectorAll<HTMLInputElement>('[data-bk-opt]').forEach((i) => { i.checked = st[i.dataset.bkOpt as keyof St] === i.value; });
    const c = cents(st);
    totalEls.forEach((el) => { el.textContent = eur.format(c / 100); });
    if (barSum) { barSum.textContent = `ab ${eur.format(c / 100)}`; const sub = document.querySelector<HTMLElement>('[data-bk-bar-sub]'); if (sub) sub.textContent = 'Zur Anfrage'; }
    if (rowsEl) rowsEl.replaceChildren(...rows(st).map(([k, v]) => {
      const d = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v; d.append(dt, dd); return d;
    }));
    const detail = { rows: rows(st).concat([['Richtwert ab', eur.format(c / 100)]]), cents: c };
    (window as any).__klSummary = detail;
    window.dispatchEvent(new CustomEvent('kl:summary', { detail }));
  };
  const placeRing = () => {
    if (!scene || hinted) { ring.hidden = true; return; }
    const p = scene.project('anlage'); if (!p) { ring.hidden = true; return; }
    ring.hidden = false;
    const W = stage.clientWidth, H = stage.clientHeight;
    const half = (ring.querySelector<HTMLElement>('.bk__ring-txt')?.offsetWidth ?? 170) / 2 + 8;
    ring.style.left = `${Math.min(Math.max(p.x, half), W - half)}px`; ring.style.top = `${Math.min(Math.max(p.y, 40), H - 70)}px`; ring.hidden = false;
  };
  const dismissHint = () => { hinted = true; ring.hidden = true; };
  const apply = (changed: string | null) => { st = normalize(st); save(st); render(); scene?.set(st, changed); placeRing(); };

  root.querySelectorAll<HTMLInputElement>('[data-bk-opt]').forEach((i) => i.addEventListener('change', () => {
    dismissHint(); (st as any)[i.dataset.bkOpt!] = i.value; apply(i.dataset.bkOpt!);
  }));
  ring.addEventListener('click', () => { dismissHint(); cycle('anlage'); });
  function cycle(z: string) {
    const list = zoneOf(z).variants; const i = list.findIndex((v) => v.id === (st as any)[z]);
    (st as any)[z] = list[(i + 1) % list.length].id; apply(z);
  }
  const onPick = (z: string) => { dismissHint(); cycle(z); };
  stage.addEventListener('pointerdown', () => { if (!hinted) dismissHint(); }, { passive: true });

  let started = false;
  const conn = (navigator as any).connection;
  const slow = !!conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
  const start = async () => {
    if (slow) { stage.classList.add('no3d'); return; }
    if (started) return; started = true;
    try {
      const mod = await import('./heiz3d');
      const h = await mod.createHeiz(canvas, { base: import.meta.env.BASE_URL, reduced, onPick });
      if (!h) throw new Error('kein WebGL');
      scene = h; h.set(st); stage.classList.add('is-3d'); hinted = false; placeRing();
    } catch (e) { console.error('heiz: 3D nicht verfügbar', e); nogl.hidden = false; stage.classList.add('no3d'); }
  };
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 900 }) : setTimeout(fn, 250));
  new IntersectionObserver((es) => { const on = es[0].isIntersecting; if (on) { idle(start); scene?.setActive(true); } else scene?.setActive(false); }, { rootMargin: '150px' }).observe(stage);
  window.addEventListener('resize', () => placeRing(), { passive: true });
  render();
}
document.querySelectorAll<HTMLElement>('[data-bk]').forEach(init);
