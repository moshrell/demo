// Bad-Baukasten: Zustand, Preis, DOM-Auswahl, Zusammenfassung. Das 3D (bad3d.ts) wird erst geladen, wenn die Bühne sichtbar ist.
import data from '../data/bad.json';
import type { Handle } from './bad3d';

type St = { size: string; bf: boolean; wanne: string; waschen: string; wc: string; spiegel: string; fliese: string };
const KEY = 'kl:bad';
const ZONES = data.zones.map((z) => z.id) as Array<'wanne' | 'waschen' | 'wc' | 'spiegel' | 'fliese'>;
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const zoneOf = (id: string) => data.zones.find((z) => z.id === id)!;
const allowed = (v: any, size: string) => !v.only || v.only.includes(size);

function normalize(s: St): St {
  const n = { ...s };
  if (!data.sizes.some((x) => x.id === n.size)) n.size = data.defaults.size;
  for (const id of ZONES) {
    const z = zoneOf(id);
    const v = z.variants.find((x: any) => x.id === n[id]);
    if (!v || !allowed(v, n.size)) n[id] = z.variants[0].id;
  }
  if (n.bf && (n.wanne === 'wanne' || n.wanne === 'beides')) n.wanne = 'dusche';
  return n;
}
function load(): St {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return normalize({ ...(data.defaults as St), ...JSON.parse(raw) });
  } catch (e) { console.error('baukasten: Auswahl lesen', e); }
  return { ...(data.defaults as St) };
}
function save(s: St) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.error('baukasten: Auswahl speichern', e); }
}
function cents(s: St): number {
  let c = data.sizes.find((x) => x.id === s.size)!.cents;
  for (const id of ZONES) c += zoneOf(id).variants.find((v: any) => v.id === s[id])?.cents ?? 0;
  if (s.bf) c += data.barrierefrei.cents;
  return c;
}
const label = (id: string, s: St) => zoneOf(id).variants.find((v: any) => v.id === s[id as keyof St])!.label as string;
function rows(s: St): [string, string][] {
  const sz = data.sizes.find((x) => x.id === s.size)!;
  const r: [string, string][] = [['Größe', `${s.size} (${sz.area})`]];
  r.push(['Wanne / Dusche', label('wanne', s)]);
  r.push(['Waschplatz', label('waschen', s)]);
  r.push(['WC', label('wc', s)]);
  r.push(['Spiegel', label('spiegel', s)]);
  r.push(['Fliesen', label('fliese', s)]);
  if (s.bf) r.push([data.barrierefrei.label, 'Ja']);
  return r;
}

function init(root: HTMLElement) {
  const hero = root.dataset.bk === 'hero';
  const base = import.meta.env.BASE_URL;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = root.querySelector<HTMLElement>('[data-bk-stage]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-bk-canvas]')!;
  const ring = root.querySelector<HTMLButtonElement>('[data-bk-ring]')!;
  const nogl = root.querySelector<HTMLElement>('[data-bk-nogl]')!;
  const totalEls = root.querySelectorAll<HTMLElement>('[data-bk-total]');
  const capEl = root.querySelector<HTMLElement>('[data-bk-cap]');
  const rowsEl = root.querySelector<HTMLElement>('[data-bk-rows]');
  const bfBtn = root.querySelector<HTMLButtonElement>('[data-bk-bf]');
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-bk-tab]')];
  const panes = [...root.querySelectorAll<HTMLElement>('[data-bk-zone]')];
  const sizeIns = [...root.querySelectorAll<HTMLInputElement>('[data-bk-size]')];
  const barSum = document.querySelector<HTMLElement>('[data-bk-bar-sum]');

  let st = load();
  let scene: Handle | null = null;
  let hinted = true;
  let tab = ZONES[0] as string;

  const showTab = (z: string) => {
    tab = z;
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.bkTab === z)));
    panes.forEach((p) => { p.hidden = p.dataset.bkZone !== z; });
  };

  const render = () => {
    sizeIns.forEach((i) => { i.checked = i.value === st.size; });
    root.querySelectorAll<HTMLInputElement>('[data-bk-opt]').forEach((i) => {
      i.checked = st[i.dataset.bkOpt as keyof St] === i.value;
      const only = i.dataset.only;
      i.disabled = (only ? !only.split(',').includes(st.size) : false) || (st.bf && i.dataset.bkOpt === 'wanne' && (i.value === 'wanne' || i.value === 'beides'));
    });
    bfBtn?.setAttribute('aria-checked', String(st.bf));
    const c = cents(st);
    totalEls.forEach((el) => { el.textContent = eur.format(c / 100); });
    if (barSum) { barSum.textContent = `ab ${eur.format(c / 100)}`; const sub = document.querySelector<HTMLElement>('[data-bk-bar-sub]'); if (sub) sub.textContent = 'Zur Anfrage'; }
    if (rowsEl) {
      rowsEl.replaceChildren(...rows(st).map(([k, v]) => {
        const d = document.createElement('div');
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        d.append(dt, dd); return d;
      }));
    }
    if (capEl) capEl.textContent = `${label('wanne', st)} · ${label('waschen', st)} · ${label('wc', st)}`;
    const detail = { rows: rows(st).concat([['Richtwert ab', eur.format(c / 100)]]), cents: c };
    (window as any).__klSummary = detail;
    window.dispatchEvent(new CustomEvent('kl:summary', { detail }));
  };

  const placeRing = () => {
    if (!scene || hinted) { ring.hidden = true; return; }
    const p = scene.project('wanne');
    if (!p) { ring.hidden = true; return; }
    ring.style.left = `${p.x}px`; ring.style.top = `${p.y}px`; ring.hidden = false;
  };
  const dismissHint = () => { hinted = true; ring.hidden = true; };

  const apply = (changed: string | null) => {
    st = normalize(st);
    save(st);
    render();
    scene?.set(st, changed);
    placeRing();
  };

  // ---- Eingaben ----
  sizeIns.forEach((i) => i.addEventListener('change', () => { dismissHint(); st.size = i.value; apply('size'); }));
  root.querySelectorAll<HTMLInputElement>('[data-bk-opt]').forEach((i) => i.addEventListener('change', () => {
    dismissHint();
    const z = i.dataset.bkOpt as keyof St;
    (st as any)[z] = i.value;
    apply(z);
    scene?.focus(z);
  }));
  bfBtn?.addEventListener('click', () => { dismissHint(); st.bf = !st.bf; apply('bf'); });
  tabs.forEach((t) => t.addEventListener('click', () => { dismissHint(); showTab(t.dataset.bkTab!); scene?.focus(t.dataset.bkTab!); }));
  ring.addEventListener('click', () => { dismissHint(); if (!hero) { showTab('wanne'); scene?.focus('wanne'); } else cycle('wanne'); });

  // Tipp auf ein Teil im 3D
  function cycle(z: string) {
    const zone = zoneOf(z);
    const list = zone.variants.filter((v: any) => allowed(v, st.size) && !(st.bf && z === 'wanne' && (v.id === 'wanne' || v.id === 'beides')));
    const i = list.findIndex((v: any) => v.id === (st as any)[z]);
    (st as any)[z] = list[(i + 1) % list.length].id;
    apply(z);
  }
  const onPick = (z: string) => {
    dismissHint();
    if (hero) cycle(z);
    else {
      showTab(z); scene?.focus(z);
      panes.find((p) => p.dataset.bkZone === z)?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  };
  stage.addEventListener('pointerdown', () => { if (!hinted) dismissHint(); }, { passive: true });

  // ---- 3D laden, wenn sichtbar ----
  let started = false;
  const conn = (navigator as any).connection;
  const slow = !!conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
  const start = async () => {
    if (slow) { stage.classList.add('no3d'); return; }
    if (started) return;
    started = true;
    try {
      const mod = await import('./bad3d');
      const h = await mod.createBad(canvas, { base, hero, reduced, onPick });
      if (!h) throw new Error('kein WebGL');
      scene = h;
      h.set(st);
      stage.classList.add('is-3d');
      hinted = false;
      placeRing();
    } catch (e) {
      console.error('baukasten: 3D nicht verfügbar', e);
      nogl.hidden = false;
      stage.classList.add('no3d');
    }
  };
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 900 }) : setTimeout(fn, 250));
  new IntersectionObserver((es) => {
    const on = es[0].isIntersecting;
    if (on) { idle(start); scene?.setActive(true); } else scene?.setActive(false);
  }, { rootMargin: '150px' }).observe(stage);
  window.addEventListener('resize', () => placeRing(), { passive: true });

  showTab(tab);
  render();
}

document.querySelectorAll<HTMLElement>('[data-bk]').forEach(init);
