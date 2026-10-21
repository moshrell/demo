/** Konstruktor: Spiel-Logik. Zustand -> 3D-Szene (lazy) oder 2D-Skizze, Richtpreis, Meister-Hinweise, Werkbuch, URL/Speicher. */
import {
  type Cfg, type CfgKorpus, type CfgTisch, type Feld, PRESETS, clone, normalize, decode, encode, price, checks, openWarnings,
  summary, width, maxDrawers, maxShelves, HOLZ, OBER, FARBEN, TYP, TIEFEN, sagLimit,
} from './model';
import { sketch } from './sketch';
import type { WerkScene, View } from './scene';

const $ = <T extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const weak = ((navigator as any).deviceMemory && (navigator as any).deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const BASE = (document.querySelector<HTMLElement>('.kon__root')?.dataset.base || '/');
const store = {
  get(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* egal */ } },
};
const lstore = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};
const buzz = (ms = 12) => { try { if (!reduced && (navigator as any).userActivation?.hasBeenActive) navigator.vibrate?.(ms); } catch { /* kein Vibrieren */ } };

/* ------------------------------------------------------------------ Start */
const q = location.search.replace(/^\?/, '');
const sp = new URLSearchParams(q);
let cfg: Cfg =
  (sp.get('t') ? decode(q) : null) ||
  (sp.get('v') && PRESETS[sp.get('v')!] ? normalize(clone(PRESETS[sp.get('v')!])) : null) ||
  (store.get('zinke:cfg') ? decode(store.get('zinke:cfg')!) : null) ||
  normalize(clone(PRESETS.schrank));
let touched = !!(sp.get('t') || store.get('zinke:cfg'));

let scene: WerkScene | null = null;
let useGL = false;
let tool: 'fach' | 'tuer' | 'schub' | 'rueck' | 'leer' = 'fach';
let tab: 'masse' | 'fuell' | 'holz' | 'ansicht' = 'masse';
let sel = 0;
let view: View = 'front';
let lastAct = '';
let step: 1 | 2 | 3 = 1;

const stage = $('[data-stage]'), svgBox = $('[data-svg]'), canvas = $<HTMLCanvasElement>('[data-canvas]');
const panel = $('[data-panel]'), felderRow = $('[data-felder]'), hintsBox = $('[data-hints]'), toast = $('[data-toast]');
const priceEl = $('[data-price]'), priceDetail = $('[data-price-detail]'), tabsEl = $('[data-tabs]');

/* ----------------------------------------------------------------- Helfer */
const was = () => (cfg.t === 's' && cfg.felder.some((f) => f.g) ? 'Garderobe' : TYP[cfg.t]);
function chip(act: string, label: string, on: boolean, extra = '') {
  return `<button type="button" class="kc${on ? ' is-on' : ''}" data-act="${act}" aria-pressed="${on}" ${extra}>${label}</button>`;
}
function stepper(act: string, label: string, val: string, dis: [boolean, boolean] = [false, false]) {
  return `<div class="ks"><span class="ks__l" id="l-${act}">${label}</span><span class="ks__c" role="group" aria-labelledby="l-${act}">
    <button type="button" class="ks__b" data-act="${act}-" aria-label="${label}: weniger" ${dis[0] ? 'disabled' : ''}>−</button>
    <output class="ks__v" aria-live="polite">${val}</output>
    <button type="button" class="ks__b" data-act="${act}+" aria-label="${label}: mehr" ${dis[1] ? 'disabled' : ''}>+</button></span></div>`;
}
let toastT = 0;
function say(t: string, ms = 2200) {
  toast.textContent = t; toast.classList.add('is-on');
  clearTimeout(toastT); toastT = window.setTimeout(() => toast.classList.remove('is-on'), ms);
}

/* ---------------------------------------------------------------- Werkbuch */
const BADGES: [string, string, string][] = [
  ['erstes', 'Erstes Möbel', 'Sie haben etwas verändert: ein Möbel ist geboren.'],
  ['massiv', 'Massivholz-Fan', 'Alle vier Hölzer ausprobiert.'],
  ['dach', 'Unterm Dach', 'Eine Schräge eingebaut.'],
  ['schub', 'Schubladen-Sammler', 'Sechs oder mehr Schubladen.'],
  ['statik', 'Statik verstanden', 'Einen Meister-Hinweis behoben.'],
  ['meister', 'Vertrau dem Meister', '„Überrasch mich“ benutzt.'],
  ['abnahme', 'Abgenommen', 'Entwurf mit Stempel bekommen.'],
];
const got = new Set<string>(JSON.parse(lstore.get('zinke:badges') || '[]'));
const holzSeen = new Set<string>(JSON.parse(store.get('zinke:holz') || '[]'));
function award(id: string) {
  if (got.has(id)) return;
  got.add(id); lstore.set('zinke:badges', JSON.stringify([...got]));
  const b = BADGES.find((x) => x[0] === id)!;
  say(`Werkbuch: ${b[1]}`, 2600); buzz(20); drawBook();
}
function drawBook() {
  $('[data-count]').textContent = `${got.size}/${BADGES.length}`;
  $('[data-book]').innerHTML = BADGES.map(([id, n, t]) => `<li class="${got.has(id) ? 'is-got' : ''}"><strong>${n}</strong><span>${got.has(id) ? t : 'noch offen'}</span></li>`).join('');
}
function checkAwards() {
  if (touched) award('erstes');
  if (cfg.t !== 't' && cfg.sch !== '0') award('dach');
  if (cfg.t !== 't' && cfg.felder.reduce((s, f) => s + f.d, 0) >= 6) award('schub');
  holzSeen.add(cfg.holz); store.set('zinke:holz', JSON.stringify([...holzSeen]));
  if (holzSeen.size >= 4 && touched) award('massiv');
}

/* ------------------------------------------------------------------ Render */
function renderTabs() {
  const tabs: [typeof tab, string][] = [['masse', 'Maße'], ...(cfg.t === 't' ? [] : [['fuell', 'Füllung'] as [typeof tab, string]]), ['holz', 'Holz'], ['ansicht', 'Ansicht']];
  if (!tabs.some((t) => t[0] === tab)) tab = 'masse';
  tabsEl.innerHTML = tabs.map(([id, l]) => `<button type="button" role="tab" id="tab-${id}" aria-selected="${tab === id}" aria-controls="panel" tabindex="${tab === id ? 0 : -1}" data-tab="${id}">${l}</button>`).join('');
}
function renderPanel() {
  const c = cfg; let h = '';
  if (tab === 'masse') {
    if (c.t === 't') {
      h += stepper('tl', 'Länge', `${c.l} cm`, [c.l <= 140, c.l >= 300]);
      h += stepper('tq', 'Breite', `${c.q} cm`, [c.q <= 80, c.q >= 110]);
      h += `<div class="kr"><span class="ks__l">Platte</span><span class="kcs">${chip('tp3', '3 cm', c.p === 3)}${chip('tp4', '4 cm', c.p === 4)}</span></div>`;
      h += `<div class="kr"><span class="ks__l">Gestell</span><span class="kcs">${chip('gv', 'Vier Beine', c.g === 'v')}${chip('gk', 'Kufen', c.g === 'k')}${chip('gw', 'Wangen', c.g === 'w')}</span></div>`;
    } else {
      h += stepper('n', 'Felder', String(c.n), [c.n <= 1, c.n >= 6]);
      h += stepper('fb', 'Feldbreite', `${c.fb} cm`, [c.fb <= 40, c.fb >= 100]);
      h += `<p class="kt">Gesamtbreite <strong>${width(c)} cm</strong></p>`;
      h += stepper('h', 'Höhe', `${c.h} cm`, [c.h <= 60, c.h >= 260]);
      h += `<div class="kr"><span class="ks__l">Tiefe</span><span class="kcs">${TIEFEN[c.t].map((d) => chip('d' + d, `${d} cm`, c.tf === d)).join('')}</span></div>`;
      if (c.t === 's') {
        h += `<div class="kr"><span class="ks__l">Dachschräge</span><span class="kcs">${chip('s0', 'keine', c.sch === '0')}${chip('sl', 'links', c.sch === 'l')}${chip('sr', 'rechts', c.sch === 'r')}</span></div>`;
        if (c.sch !== '0') {
          h += stepper('k', 'Kniestock', `${c.k} cm`, [c.k <= 60, c.k >= Math.min(140, c.h)]);
          h += stepper('a', 'Neigung', `${c.a}°`, [c.a <= 30, c.a >= 50]);
        }
      }
    }
  } else if (tab === 'fuell' && c.t !== 't') {
    const tools: [typeof tool, string][] = [['fach', 'Fachboden'], ['tuer', 'Tür'], ['schub', 'Schublade'], ['rueck', 'Rückwand'], ['leer', 'Leeren']];
    h += `<p class="kt">Werkzeug wählen, dann ein Feld antippen (in der Vorschau oder unten).</p>`;
    h += `<div class="kcs kcs--tools" role="group" aria-label="Werkzeug">${tools.map(([id, l]) => chip('w-' + id, l, tool === id)).join('')}</div>`;
    const f = c.felder[sel];
    h += `<p class="kt kt--feld">Feld ${sel + 1}: ${f.g ? 'Garderobe (fest)' : [`${f.s} Fachböden`, f.t ? 'Tür' : 'offen', `${f.d} Schubladen`, f.b ? 'Rückwand' : 'ohne Rückwand'].join(', ')}</p>`;
    if (c.felder.some((x) => x.s > 0 && !x.g) && width(c) > 0) {
      const wide = c.fb - 2 > sagLimit(c.holz);
      h += `<label class="kcheck"><input type="checkbox" data-act="steel" ${c.x ? 'checked' : ''}><span>Stahlschienen in breiten Fächern (+ Aufpreis)${wide ? '' : ' (hier nicht nötig)'}</span></label>`;
    }
  } else if (tab === 'holz') {
    h += `<div class="kr"><span class="ks__l">Holz</span><span class="kcs">${(Object.keys(HOLZ) as (keyof typeof HOLZ)[]).map((k) => `<button type="button" class="kc kc--tex${c.holz === k ? ' is-on' : ''}" data-act="h-${k}" aria-pressed="${c.holz === k}" data-tex="${k}"><i></i>${HOLZ[k]}</button>`).join('')}</span></div>`;
    h += `<div class="kr"><span class="ks__l">Oberfläche</span><span class="kcs">${(Object.keys(OBER) as (keyof typeof OBER)[]).map((k) => chip('o-' + k, OBER[k].replace(' lackiert', ''), c.ober === k)).join('')}</span></div>`;
    if (c.ober === 'f') h += `<div class="kr"><span class="ks__l">Farbe</span><span class="kcs">${FARBEN.map((f, i) => `<button type="button" class="kc kc--col${c.farbe === i ? ' is-on' : ''}" data-act="c-${i}" aria-pressed="${c.farbe === i}"><i style="background:${f.hex}"></i>${f.name}</button>`).join('')}</span></div>`;
    h += `<p class="kt">${c.holz === 'e' ? 'Eiche: hart, lebhaft, honigfarben mit den Jahren.' : c.holz === 'n' ? 'Nussbaum: dunkel, ruhig, edel.' : c.holz === 'a' ? 'Ahorn: fast weiß, fein, modern.' : 'Kiefer: warm, günstig, mit Ästen.'} ${c.ober === 'g' ? 'Geölt: fühlt sich nach Holz an, lässt sich ausbessern.' : c.ober === 'l' ? 'Lackiert: robust und pflegeleicht, etwas glatter.' : 'Farbig: nur Fronten und Türen, das Holz bleibt innen sichtbar.'}</p>`;
  } else {
    h += `<div class="kr"><span class="ks__l">Blick</span><span class="kcs">${(['front', 'links', 'rechts', 'detail'] as View[]).map((v) => chip('v-' + v, { front: 'Front', links: 'Links', rechts: 'Rechts', detail: 'Detail' }[v], view === v, useGL ? '' : 'disabled')).join('')}</span></div>`;
    if (!useGL) h += `<p class="kt">Einfache Ansicht: Ihr Gerät zeigt die flache Frontansicht, alles andere funktioniert genauso.</p>`;
    h += `<div class="kr"><span class="ks__l">Vorlage</span><span class="kcs">${chip('p-schrank', 'Schrank unter Schräge', false)}${chip('p-regal', 'Bücherregal', false)}${chip('p-tisch', 'Esstisch', false)}${chip('p-garderobe', 'Garderobe', false)}</span></div>`;
    h += `<div class="kr kr--acts"><button type="button" class="btn btn--sm" data-act="rand">Überrasch mich</button><button type="button" class="btn btn--sm" data-act="share">Link teilen</button></div>`;
  }
  panel.innerHTML = h;
  panel.setAttribute('aria-labelledby', 'tab-' + tab);
  panel.querySelectorAll<HTMLElement>('[data-tex]').forEach((b) => { b.style.setProperty('--tex', `url(${BASE}tex/${{ e: 'eiche', n: 'nussbaum', a: 'ahorn', k: 'kiefer' }[b.dataset.tex as 'e']}.jpg)`); });
  if (lastAct) panel.querySelector<HTMLElement>(`[data-act="${CSS.escape(lastAct)}"]`)?.focus({ preventScroll: true });
}
function renderFelder() {
  if (cfg.t === 't') { felderRow.hidden = true; return; }
  felderRow.hidden = tab !== 'fuell';
  felderRow.innerHTML = cfg.felder.map((f, i) => `<button type="button" class="kf${i === sel ? ' is-sel' : ''}" data-feld="${i}" aria-pressed="${i === sel}" aria-label="Feld ${i + 1} wählen"><span>${i + 1}</span><small>${f.g ? 'Garderobe' : [f.s ? f.s + ' F' : '', f.d ? f.d + ' S' : '', f.t ? 'Tür' : ''].filter(Boolean).join(' · ') || 'leer'}</small></button>`).join('');
}
function renderHints() {
  const hs = checks(cfg);
  hintsBox.hidden = !hs.length;
  hintsBox.innerHTML = hs.map((x, i) => `<div class="kh${x.info ? ' kh--info' : ''}"><p><strong>${x.info ? 'Meister-Tipp' : 'Meister-Hinweis'}:</strong> ${x.text}</p>${(x.fix || []).map((f, j) => `<button type="button" class="btn btn--sm" data-fix="${i}.${j}">${f.label}</button>`).join('')}</div>`).join('');
}
function renderPrice() {
  const p = price(cfg);
  priceEl.textContent = 'ab ' + eur.format(p.total);
  const lfm = p.lfm ? ` · etwa ${eur.format(p.lfm)} pro Laufmeter` : '';
  priceDetail.innerHTML = `<dl><div><dt>Material (${HOLZ[cfg.holz]}, ${OBER[cfg.ober].split(' ')[0]})</dt><dd>${eur.format(p.material)}</dd></div><div><dt>Werkstattstunden</dt><dd>${eur.format(p.stunden)}</dd></div><div><dt>Montage und Anfahrt${cfg.t === 't' ? ' (Lieferung)' : ''}</dt><dd>${eur.format(p.montage)}</dd></div></dl>
  <p class="kt">Richtwert inkl. 19 % MwSt.${lfm}. Den Festpreis bekommen Sie schriftlich nach dem Aufmaß.</p>`;
  return p;
}
function drawSketch() { svgBox.innerHTML = sketch(cfg, 'wood', { picks: cfg.t !== 't', marks: true }); }

function persist() {
  const e = encode(cfg);
  store.set('zinke:cfg', e);
  try { history.replaceState(null, '', location.pathname + '?' + e); } catch { /* egal */ }
}
function pushToForm() {
  const p = price(cfg);
  const rows = summary(cfg); const hs = checks(cfg).filter((h) => !h.info);
  if (hs.length) rows.push(['Offener Hinweis', hs.map((h) => h.text).join(' ')]);
  window.dispatchEvent(new CustomEvent('zinke:cfg', { detail: { rows, total: p.total, was: was() } }));
}

function refresh(opts: { animate?: boolean; panel?: boolean } = {}) {
  cfg = normalize(cfg);
  persist(); checkAwards();
  renderPrice(); renderHints(); renderFelder();
  if (opts.panel !== false) renderPanel();
  if (scene && useGL) scene.setConfig(cfg, opts.animate !== false && !reduced);
  drawSketch(); pushToForm();
}
function edit(fn: (c: any) => void, o: { animate?: boolean } = {}) { touched = true; fn(cfg); refresh(o); }

/* ------------------------------------------------------------------ Aktionen */
function applyTool(i: number) {
  const f: Feld = (cfg as CfgKorpus).felder[i];
  if (f.g && tool !== 'leer') { say('Das Garderoben-Feld ist fest eingebaut.'); return; }
  const c = cfg as CfgKorpus;
  edit(() => {
    if (tool === 'fach') { const m = maxShelves(c, i); f.s = f.s >= m ? 0 : f.s + 1; }
    else if (tool === 'schub') { const m = maxDrawers(c, i); f.d = f.d >= m ? 0 : f.d + 1; }
    else if (tool === 'tuer') f.t = !f.t;
    else if (tool === 'rueck') f.b = !f.b;
    else { f.s = 0; f.d = 0; f.t = false; f.b = false; if (f.g) { delete f.g; } }
  });
  scene?.mark(i);
}
function pick(i: number) {
  sel = i; tab = 'fuell'; renderTabs(); applyTool(i);
}
function rand() {
  const R = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const t = R(['s', 's', 's', 'r', 't']) as Cfg['t'];
  let c: Cfg;
  if (t === 't') c = { t: 't', l: R([160, 180, 200, 220, 240, 260]), q: R([90, 100]), p: 4, g: R(['v', 'k', 'w']) as CfgTisch['g'], holz: R(['e', 'n', 'a']) as any, ober: 'g', farbe: 0 };
  else {
    const n = R([3, 4, 4, 5]), fb = R([50, 60, 60, 70, 80]);
    const felder: Feld[] = Array.from({ length: n }, () => { const r = Math.random(); return r < 0.35 ? { s: 3, d: 0, t: true, b: true } : r < 0.65 ? { s: 2, d: R([2, 3]), t: false, b: true } : { s: 4, d: 0, t: false, b: true }; });
    c = { t, n, fb, h: t === 's' ? R([200, 220, 230, 240]) : R([180, 200, 220]), tf: t === 's' ? R([50, 60]) : R([30, 35]), holz: R(['e', 'n', 'a', 'k']) as any,
      ober: t === 's' && Math.random() < 0.3 ? 'f' : 'g', farbe: R([0, 1, 2, 3]), sch: t === 's' ? R(['0', 'l', 'r']) as any : '0', k: R([80, 100, 120]), a: R([40, 45]), x: false, felder };
  }
  cfg = normalize(c);
  for (let i = 0; i < 3 && openWarnings(cfg); i++) checks(cfg).find((h) => h.fix)?.fix?.[0].apply(cfg);
  cfg = normalize(cfg); sel = 0; touched = true; award('meister'); refresh({ animate: false });
  scene?.setConfig(cfg, false);
}
function setView(v: View) { view = v; scene?.setView(v); renderPanel(); }

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const tabB = t.closest<HTMLElement>('[data-tab]');
  if (tabB) { tab = tabB.dataset.tab as typeof tab; lastAct = ''; renderTabs(); renderPanel(); renderFelder(); (document.getElementById('tab-' + tab) as HTMLElement)?.focus(); return; }
  const fb = t.closest<HTMLElement>('[data-feld]');
  if (fb) { sel = Number(fb.dataset.feld); if (tab === 'fuell') applyTool(sel); renderFelder(); renderPanel(); return; }
  const fix = t.closest<HTMLElement>('[data-fix]');
  if (fix) { const [i, j] = fix.dataset.fix!.split('.').map(Number); const h = checks(cfg).filter((x) => true)[i]; h?.fix?.[j].apply(cfg); touched = true; award('statik'); refresh(); if (step === 2) renderAbnahme(); return; }
  const sk = t.closest<SVGElement>('.sk-pick');
  if (sk) { pick(Number(sk.getAttribute('data-feld'))); return; }
  const b = t.closest<HTMLElement>('[data-act]');
  if (!b || !panel.contains(b)) return;
  const a = b.dataset.act!; lastAct = a;
  const c = cfg as any;
  const inc = (k: string, d: number) => edit(() => { c[k] += d; });
  if (a === 'n+') { edit(() => { c.n++; c.felder.push({ s: 2, d: 0, t: false, b: true }); }); }
  else if (a === 'n-') { edit(() => { c.n--; c.felder.pop(); sel = Math.min(sel, c.n - 1); }); }
  else if (a === 'fb+') inc('fb', 10); else if (a === 'fb-') inc('fb', -10);
  else if (a === 'h+') inc('h', 10); else if (a === 'h-') inc('h', -10);
  else if (a === 'k+') inc('k', 10); else if (a === 'k-') inc('k', -10);
  else if (a === 'a+') inc('a', 5); else if (a === 'a-') inc('a', -5);
  else if (a === 'tl+') inc('l', 20); else if (a === 'tl-') inc('l', -20);
  else if (a === 'tq+') inc('q', 10); else if (a === 'tq-') inc('q', -10);
  else if (a === 'tp3') edit(() => { c.p = 3; }); else if (a === 'tp4') edit(() => { c.p = 4; });
  else if (a.startsWith('g') && a.length === 2) edit(() => { c.g = a[1]; });
  else if (/^d\d+$/.test(a)) edit(() => { c.tf = Number(a.slice(1)); });
  else if (a === 's0' || a === 'sl' || a === 'sr') edit(() => { c.sch = a === 's0' ? '0' : a === 'sl' ? 'l' : 'r'; });
  else if (a.startsWith('w-')) { tool = a.slice(2) as typeof tool; renderPanel(); }
  else if (a.startsWith('h-')) edit(() => { c.holz = a.slice(2); }, { animate: false });
  else if (a.startsWith('o-')) edit(() => { c.ober = a.slice(2); }, { animate: false });
  else if (a.startsWith('c-')) edit(() => { c.farbe = Number(a.slice(2)); }, { animate: false });
  else if (a.startsWith('v-')) setView(a.slice(2) as View);
  else if (a.startsWith('p-')) { cfg = normalize(clone(PRESETS[a.slice(2)])); sel = 0; touched = true; refresh({ animate: false }); scene?.setConfig(cfg, false); }
  else if (a === 'rand') rand();
  else if (a === 'share') share();
});
panel.addEventListener('change', (e) => {
  const i = e.target as HTMLInputElement;
  if (i.dataset.act === 'steel') { lastAct = 'steel'; edit((c) => { c.x = i.checked; }); }
});
tabsEl.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const bs = [...tabsEl.querySelectorAll<HTMLElement>('[data-tab]')]; const i = bs.findIndex((x) => x === document.activeElement);
  bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length].click();
});

async function share() {
  const url = location.origin + location.pathname + '?' + encode(cfg);
  try {
    if (navigator.share) { await navigator.share({ title: 'Mein Möbel bei Tischlerei Wendholm', url }); return; }
    await navigator.clipboard.writeText(url); say('Link kopiert. Schicken Sie ihn Ihrem Partner.');
  } catch {
    say('Link steht jetzt in der Adresszeile. Kopieren Sie ihn von dort.');
  }
}
$('[data-share]').addEventListener('click', share);
$('[data-open-book]').addEventListener('click', () => { const d = $<HTMLDialogElement>('[data-dialog]'); drawBook(); d.showModal?.(); });
$('[data-close-book]').addEventListener('click', () => $<HTMLDialogElement>('[data-dialog]').close?.());

/* ---------------------------------------------------------------- Schritte */
const s1 = $('[data-step="1"]'), s2 = $('[data-step="2"]'), s3 = $('[data-step="3"]');
function go(n: 1 | 2 | 3) {
  step = n; s1.hidden = n !== 1; s2.hidden = n !== 2; s3.hidden = n !== 3;
  document.querySelectorAll<HTMLElement>('[data-crumb]').forEach((c) => { c.setAttribute('aria-current', c.dataset.crumb === String(n) ? 'step' : 'false'); });
  if (n === 2) renderAbnahme();
  if (n === 3) pushToForm();
  if (n !== 1) window.scrollTo({ top: 0 });
  else scene?.resize();
  (n === 1 ? $('[data-go="2"]') : $(`[data-step="${n}"] h2`)).focus?.({ preventScroll: true });
}
document.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go) as 1 | 2 | 3)));
document.addEventListener('zinke:sent', () => { try { sessionStorage.removeItem('zinke:cfg'); } catch { /* egal */ } });

function renderAbnahme() {
  const hs = checks(cfg).filter((h) => !h.info);
  const ok = hs.length === 0;
  $('[data-sketch]').innerHTML = sketch(cfg, 'pencil');
  const stamp = $('[data-stamp]');
  stamp.className = 'stamp' + (ok ? ' is-ok' : ' is-no');
  stamp.innerHTML = ok ? `<span>Abgenommen</span><small>J. Wendholm · ${new Date().toLocaleDateString('de-DE')}</small>` : `<span>Noch nicht</span><small>Hinweise unten klären</small>`;
  if (ok) { stamp.classList.remove('is-in'); void stamp.offsetWidth; stamp.classList.add('is-in'); award('abnahme'); buzz(30); }
  $('[data-abn-hints]').innerHTML = hs.map((x, i) => `<div class="kh"><p><strong>Meister-Hinweis:</strong> ${x.text}</p>${(x.fix || []).map((f, j) => `<button type="button" class="btn btn--sm" data-fix="${checks(cfg).indexOf(x)}.${j}">${f.label}</button>`).join('')}</div>`).join('');
  $('[data-abn-list]').innerHTML = summary(cfg).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const p = price(cfg);
  $('[data-abn-price]').innerHTML = `<dl><div><dt>Material</dt><dd>${eur.format(p.material)}</dd></div><div><dt>Werkstattstunden</dt><dd>${eur.format(p.stunden)}</dd></div><div><dt>Montage und Anfahrt</dt><dd>${eur.format(p.montage)}</dd></div><div class="af__sum"><dt>Richtpreis ab</dt><dd>${eur.format(p.total)}</dd></div></dl><p class="kt">inkl. 19 % MwSt. Festpreis nach dem Aufmaß (89 €, bei Auftrag verrechnet).</p>`;
}

/* -------------------------------------------------------------------- Start */
renderTabs(); drawBook(); drawSketch();
refresh({ animate: false });

(async () => {
  try {
    const mod = await import('./scene');
    if (!mod.hasWebGL()) throw new Error('kein WebGL');
    scene = await mod.createScene({
      canvas, base: BASE, mode: 'konstruktor', lowPower: !!weak, noFx: reduced, maxYaw: 30,
      onPick: (i) => pick(i),
      onLand: () => buzz(12),
      onSlow: () => { useGL = false; stage.classList.remove('is-gl'); renderPanel(); },
    });
    useGL = true; scene.setConfig(cfg, false);
    stage.classList.add('is-gl'); renderPanel();
  } catch {
    useGL = false; stage.classList.remove('is-gl'); renderPanel();
  }
})();
