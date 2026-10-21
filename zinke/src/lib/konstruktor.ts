/** Konstruktor: Spiel-Logik. Zustand -> 3D-Szene (lazy) oder 2D-Skizze, Richtpreis, Meister-Hinweise, Werkbuch, URL/Speicher. */
import {
  type Cfg, type CfgKorpus, type CfgTisch, type Feld, type Hinweis, PRESETS, VORLAGEN, DECK, BEIZEN, clone, normalize, decode, encode, price, checks, openWarnings,
  summary, width, maxDrawers, maxShelves, HOLZ, OBER, TIEFEN, sagLimit, label, LIMITS,
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
type Tab = 'vorlage' | 'masse' | 'felder' | 'holz' | 'ansicht';
const q = location.search.replace(/^\?/, '');
const sp = new URLSearchParams(q);
let cfg: Cfg =
  (sp.get('t') ? decode(q) : null) ||
  (sp.get('v') && PRESETS[sp.get('v')!] ? normalize(clone(PRESETS[sp.get('v')!])) : null) ||
  (store.get('zinke:cfg') ? decode(store.get('zinke:cfg')!) : null) ||
  normalize(clone(PRESETS.schrank));
let touched = !!(sp.get('t') || store.get('zinke:cfg'));
let woodChosen = touched;           // Holz/Oberfläche wurden bewusst gewählt: Vorlagen lassen sie in Ruhe
let tab: Tab = cfg.t === 't' ? 'masse' : 'felder';
let sel = 0;
let view: View = 'front';
let lastAct = '';
let step: 1 | 2 | 3 = 1;
const hist: string[] = [];

let scene: WerkScene | null = null;
let useGL = false;

const stage = $('[data-stage]'), svgBox = $('[data-svg]'), canvas = $<HTMLCanvasElement>('[data-canvas]');
const panel = $('[data-panel]'), toast = $('[data-toast]'), hintbar = $<HTMLButtonElement>('[data-hintbar]');
const priceEl = $('[data-price]'), priceDetail = $('[data-price-detail]'), tabsEl = $('[data-tabs]');
const sheet = $<HTMLDialogElement>('[data-sheet]'), undoB = $<HTMLButtonElement>('[data-undo]');

/* ----------------------------------------------------------------- Helfer */
const K = () => cfg as CfgKorpus;
const was = () => label(cfg);
function chip(act: string, text: string, on: boolean, extra = '') {
  return `<button type="button" class="kc${on ? ' is-on' : ''}" data-act="${act}" aria-pressed="${on}" ${extra}>${text}</button>`;
}
function stepper(act: string, st: number, text: string, val: string, dis: [boolean, boolean] = [false, false]) {
  const id = 'l-' + act.replace(/\W/g, '');
  return `<div class="ks"><span class="ks__l" id="${id}">${text}</span><span class="ks__c" role="group" aria-labelledby="${id}">
    <button type="button" class="ks__b" data-act="${act}:${-st}" aria-label="${text}: weniger" ${dis[0] ? 'disabled' : ''}>−</button>
    <output class="ks__v" aria-live="polite">${val}</output>
    <button type="button" class="ks__b" data-act="${act}:${st}" aria-label="${text}: mehr" ${dis[1] ? 'disabled' : ''}>+</button></span></div>`;
}
let toastT = 0;
function say(t: string, ms = 2200) {
  toast.textContent = t; toast.classList.add('is-on');
  clearTimeout(toastT); toastT = window.setTimeout(() => toast.classList.remove('is-on'), ms);
}
/* Rückgängig */
function snap() { hist.push(encode(cfg)); if (hist.length > 40) hist.shift(); undoB.disabled = false; }
function undo() {
  const e = hist.pop(); undoB.disabled = !hist.length;
  if (!e) return;
  const c = decode(e); if (!c) return;
  cfg = c; sel = Math.min(sel, cfg.t === 't' ? 0 : K().n - 1);
  if (tab === 'felder' && cfg.t === 't') tab = 'masse';
  refresh({ animate: false }); renderTabs(); say('Rückgängig gemacht.');
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
  const tabs: [Tab, string][] = [['vorlage', 'Vorlage'], ['masse', 'Maße'], ['felder', cfg.t === 't' ? 'Design' : 'Felder'], ['holz', 'Holz'], ['ansicht', 'Ansicht']];
  tabsEl.innerHTML = tabs.map(([id, l]) => `<button type="button" role="tab" id="tab-${id}" aria-selected="${tab === id}" aria-controls="panel" tabindex="${tab === id ? 0 : -1}" data-tab="${id}">${l}</button>`).join('');
}
const feldInfo = (f: Feld) => f.g ? 'Garderobe' : [f.s ? f.s + ' Fach' : '', f.d ? f.d + ' Schub' : '', f.t ? 'Tür' : ''].filter(Boolean).join(' · ') || 'leer';
const TIP: Record<string, string> = {
  e: 'Eiche: hart, lebhafte Maserung, wird mit den Jahren honigfarben.',
  n: 'Nussbaum: dunkel, ruhig, edel. Dunkle Beizen wirken hier besonders tief.',
  a: 'Ahorn: fast weiß, fein, modern. Nimmt jede Farbe sauber an.',
  k: 'Kiefer: warm, günstig, mit Ästen. Weißlasur macht sie skandinavisch.',
};
const OBTIP: Record<string, string> = {
  g: 'Geölt: fühlt sich nach Holz an, lässt sich später ausbessern.',
  l: 'Klarlack: robust und pflegeleicht, etwas glatter.',
  b: 'Gebeizt: die Farbe zieht ein, die Maserung bleibt sichtbar.',
  f: 'Deckend lackiert: Farbe ohne Maserung, dazu die Holzfarbe als Kontrast.',
};
function renderPanel() {
  const c = cfg; let h = '';
  if (tab === 'vorlage') {
    h += `<p class="kt">Vorlage wählen und von dort weiterbauen. ${woodChosen ? 'Ihr Holz und Ihre Farbe bleiben erhalten.' : ''} Mit „Zurück“ oben holen Sie den vorherigen Stand wieder.</p>`;
    h += `<div class="kcs">${VORLAGEN.map(([k, n]) => chip('vor:' + k, n, false)).join('')}</div>`;
    h += `<div class="kr kr--acts"><button type="button" class="btn btn--sm" data-act="rand">Überrasch mich</button></div>`;
  } else if (tab === 'masse') {
    if (c.t === 't') {
      h += `<p class="kt">Das wird ein <strong>${label(c)}</strong>.</p>`;
      h += stepper('inc:l', 20, 'Länge', `${c.l} cm`, [c.l <= LIMITS.l[0], c.l >= LIMITS.l[1]]);
      h += stepper('inc:q', 10, 'Breite', `${c.q} cm`, [c.q <= LIMITS.q[0], c.q >= LIMITS.q[1]]);
      h += stepper('inc:th', 5, 'Höhe', `${c.th} cm`, [c.th <= 40, c.th >= 110]);
      h += `<div class="kr"><span class="ks__l">Platte</span><span class="kcs">${chip('set:p:3', '3 cm', c.p === 3)}${chip('set:p:4', '4 cm', c.p === 4)}</span></div>`;
    } else {
      h += `<p class="kt">Das wird ein <strong>${label(c)}</strong>, ${width(c)} cm breit.</p>`;
      h += stepper('n', 1, 'Felder', String(c.n), [c.n <= 1, c.n >= 6]);
      h += stepper('inc:fb', 10, 'Feldbreite', `${c.fb} cm`, [c.fb <= 40, c.fb >= 100]);
      const hmin = c.t === 'k' ? 40 : 60, hmax = c.t === 'k' ? 120 : 260;
      h += stepper('inc:h', 10, 'Höhe', `${c.h} cm`, [c.h <= hmin, c.h >= hmax]);
      h += `<div class="kr"><span class="ks__l">Tiefe</span><span class="kcs">${TIEFEN[c.t].map((d) => chip('set:tf:' + d, `${d} cm`, c.tf === d)).join('')}</span></div>`;
      if (!c.felder.some((x) => x.g)) h += `<div class="kr"><span class="ks__l">Fuß</span><span class="kcs">${chip('set:fu:s', 'Sockel', c.fu === 's')}${chip('set:fu:b', 'Beine', c.fu === 'b')}${chip('set:fu:n', 'Direkt', c.fu === 'n')}</span></div>`;
      if (c.t === 's') {
        h += `<div class="kr"><span class="ks__l">Dachschräge</span><span class="kcs">${chip('set:sch:0', 'keine', c.sch === '0')}${chip('set:sch:l', 'links', c.sch === 'l')}${chip('set:sch:r', 'rechts', c.sch === 'r')}${chip('set:sch:m', 'beidseitig', c.sch === 'm')}</span></div>`;
        if (c.sch !== '0') {
          h += `<div class="kr"><span class="ks__l">Lage</span><span class="kcs">${chip('set:sp:o', 'Oben (Dach)', c.sp === 'o')}${chip('set:sp:u', 'Unten (Treppe)', c.sp === 'u')}</span></div>`;
          const kmax = c.sp === 'u' ? Math.max(30, Math.min(100, c.h - 80)) : Math.min(140, c.h);
          h += stepper('inc:k', 10, c.sp === 'u' ? 'Aussparung' : 'Kniestock', `${c.k} cm`, [c.k <= (c.sp === 'u' ? 30 : 60), c.k >= kmax]);
          h += stepper('inc:a', 5, 'Neigung', `${c.a}°`, [c.a <= 30, c.a >= 50]);
        }
      }
    }
  } else if (tab === 'felder') {
    if (c.t === 't') {
      h += `<div class="kr"><span class="ks__l">Plattenform</span><span class="kcs">${chip('set:pf:r', 'Eckig', c.pf === 'r')}${chip('set:pf:a', 'Abgerundet', c.pf === 'a')}${chip('set:pf:o', 'Oval', c.pf === 'o')}</span></div>`;
      h += `<div class="kr"><span class="ks__l">Kante</span><span class="kcs">${chip('set:e:g', 'Gerade', c.e === 'g')}${chip('set:e:f', 'Gefast', c.e === 'f')}${chip('set:e:b', 'Baumkante', c.e === 'b', c.pf !== 'r' ? 'disabled' : '')}</span></div>`;
      h += `<div class="kr"><span class="ks__l">Gestell</span><span class="kcs">${([['v', 'Vier Beine'], ['z', 'Zarge'], ['x', 'Kreuz'], ['k', 'Kufen'], ['w', 'Wangen'], ['b', 'Bock']] as [string, string][]).map(([k, n]) => chip('set:g:' + k, n, c.g === k)).join('')}</span></div>`;
    } else {
      h += `<p class="kt">1. Feld wählen (hier oder in der Vorschau), 2. Inhalt bestimmen.</p>`;
      h += `<div class="kfeld" role="group" aria-label="Feld wählen">${c.felder.map((f, i) => `<button type="button" class="kf${i === sel ? ' is-sel' : ''}" data-feld="${i}" aria-pressed="${i === sel}" aria-label="Feld ${i + 1} wählen"><span>${i + 1}</span><small>${feldInfo(f)}</small></button>`).join('')}</div>`;
      const f = c.felder[sel];
      h += `<div class="kf-edit"><p class="kf-edit__h">Feld ${sel + 1} von ${c.n}</p>`;
      if (f.g) {
        h += `<p class="kt">Garderobe: Haken und Bank sind fest eingebaut.</p><div class="kr kr--acts"><button type="button" class="btn btn--sm" data-act="f:clear">Zu normalem Feld machen</button></div>`;
      } else {
        const ms = maxShelves(c, sel), md = maxDrawers(c, sel);
        h += stepper('f:s', 1, 'Fachböden', String(f.s), [f.s <= 0, f.s >= ms]);
        h += stepper('f:d', 1, 'Schubladen', String(f.d), [f.d <= 0, f.d >= md]);
        h += `<div class="kr"><span class="ks__l">Front und Rücken</span><span class="kcs">${chip('f:t', 'Tür', f.t)}${chip('f:b', 'Rückwand', f.b)}</span></div>`;
        h += `<div class="kr kr--acts"><button type="button" class="btn btn--sm" data-act="f:clear">Feld leeren</button>${c.n > 1 ? '<button type="button" class="btn btn--sm" data-act="f:copy">Auf alle Felder</button>' : ''}</div>`;
      }
      h += `</div>`;
      if (c.felder.some((x) => x.s > 0 && !x.g)) {
        const wide = c.fb - 2 > sagLimit(c.holz);
        h += `<label class="kcheck"><input type="checkbox" data-act="steel" ${c.x ? 'checked' : ''}><span>Stahlschienen in breiten Fächern (+ Aufpreis)${wide ? '' : ' (hier nicht nötig)'}</span></label>`;
      }
    }
  } else if (tab === 'holz') {
    h += `<div class="kr"><span class="ks__l">Holz</span><span class="kcs">${(Object.keys(HOLZ) as (keyof typeof HOLZ)[]).map((k) => `<button type="button" class="kc kc--tex${c.holz === k ? ' is-on' : ''}" data-act="set:holz:${k}" aria-pressed="${c.holz === k}" data-tex="${k}"><i></i>${HOLZ[k]}</button>`).join('')}</span></div>`;
    h += `<div class="kr"><span class="ks__l">Oberfläche</span><span class="kcs">${chip('set:ober:g', 'Geölt', c.ober === 'g')}${chip('set:ober:l', 'Klarlack', c.ober === 'l')}${chip('set:ober:b', 'Gebeizt', c.ober === 'b')}${chip('set:ober:f', 'Deckend', c.ober === 'f')}</span></div>`;
    if (c.ober === 'b') {
      h += `<p class="ks__l">Beizen für ${HOLZ[c.holz]}</p><div class="ksw">${BEIZEN[c.holz].map((b, i) => `<button type="button" class="${c.farbe === i ? 'is-on' : ''}" data-act="set:farbe:${i}" aria-pressed="${c.farbe === i}" data-hex="${b.hex}" data-tex="${c.holz}" data-mul="1"><i></i>${b.name}</button>`).join('')}</div>`;
    } else if (c.ober === 'f') {
      h += `<p class="ks__l">Lackfarbe</p><div class="ksw ksw--deck">${DECK.map((b, i) => `<button type="button" class="${c.farbe === i ? 'is-on' : ''}" data-act="set:farbe:${i}" aria-pressed="${c.farbe === i}" data-hex="${b.hex}"><i></i>${b.name}</button>`).join('')}</div>`;
      if (c.t !== 't') h += `<div class="kr"><span class="ks__l">Lack auf</span><span class="kcs">${chip('set:fk:0', 'Nur Fronten', !c.fk)}${chip('set:fk:1', 'Ganzes Möbel', c.fk)}</span></div>`;
    }
    h += `<p class="kt">${TIP[c.holz]} ${OBTIP[c.ober]}</p>`;
  } else {
    const V: [View, string][] = [['front', 'Front'], ['links', 'Von links'], ['rechts', 'Von rechts'], ['oben', 'Von oben'], ['ecke', 'Ecke'], ['nah', 'Nah']];
    h += `<div class="kr"><span class="ks__l">Blick</span><span class="kcs">${V.map(([v, n]) => chip('view:' + v, n, view === v, useGL ? '' : 'disabled')).join('')}</span></div>`;
    h += useGL ? `<p class="kt">Sie können das Möbel auch mit dem Finger drehen. „Nah“ zeigt Zinken und Kanten.</p>` : `<p class="kt">Einfache Ansicht: Ihr Gerät zeigt die flache Frontansicht, alles andere funktioniert genauso.</p>`;
    h += `<div class="kr kr--acts"><button type="button" class="btn btn--sm" data-share-panel>Link teilen</button></div>`;
  }
  panel.innerHTML = h;
  panel.setAttribute('aria-labelledby', 'tab-' + tab);
  const TEX = { e: 'eiche', n: 'nussbaum', a: 'ahorn', k: 'kiefer' } as const;
  panel.querySelectorAll<HTMLElement>('[data-tex]').forEach((b) => {
    b.style.setProperty('--tex', `url(${BASE}tex/${TEX[b.dataset.tex as 'e']}.jpg)`);
    if (b.dataset.hex) { b.style.setProperty('--c', b.dataset.hex); if (b.dataset.mul) b.style.setProperty('--bm', 'multiply'); }
  });
  panel.querySelectorAll<HTMLElement>('.ksw--deck [data-hex]').forEach((b) => b.style.setProperty('--c', b.dataset.hex!));
  if (lastAct) panel.querySelector<HTMLElement>(`[data-act="${CSS.escape(lastAct)}"]`)?.focus({ preventScroll: true });
}
const hintHTML = (x: Hinweis, i: number) => `<div class="kh${x.info ? '' : ' kh--warn'}"><h3>${x.info ? 'Meister-Tipp' : 'Meister-Hinweis'}</h3><p>${x.text}</p>${x.fix?.length ? `<div class="kh__fix">${x.fix.map((f, j) => `<button type="button" class="btn btn--sm" data-fix="${i}.${j}">${f.label}</button>`).join('')}</div>` : ''}</div>`;
let hintKey = '';
function renderHints() {
  const hs = checks(cfg);
  hintbar.hidden = !hs.length;
  if (sheet.open) { if (!hs.length) sheet.close(); else $('[data-sheet-list]').innerHTML = hs.map(hintHTML).join(''); }
  if (!hs.length) { hintKey = ''; return; }
  const main = hs.find((x) => !x.info) || hs[0];
  hintbar.className = 'kon__hintbar' + (main.info ? '' : ' is-warn');
  hintbar.innerHTML = `<b>${main.info ? 'Meister-Tipp' : 'Meister-Hinweis'}</b><span class="hb__t">${main.short}</span>${hs.length > 1 ? `<span class="hb__n">+${hs.length - 1}</span>` : ''}<span class="hb__go" aria-hidden="true">›</span>`;
  hintbar.setAttribute('aria-label', `${main.info ? 'Meister-Tipp' : 'Meister-Hinweis'}: ${main.short}. ${hs.length} Notizen, öffnen`);
  const k = hs.map((x) => x.id).join();
  if (k !== hintKey && !reduced) { hintbar.classList.remove('is-new'); void hintbar.offsetWidth; hintbar.classList.add('is-new'); }
  hintKey = k;
}
function renderPrice() {
  const p = price(cfg);
  priceEl.textContent = 'ab ' + eur.format(p.total);
  const lfm = p.lfm ? ` · etwa ${eur.format(p.lfm)} pro Laufmeter` : '';
  priceDetail.innerHTML = `<dl><div><dt>Material (${HOLZ[cfg.holz]}, ${OBER[cfg.ober]})</dt><dd>${eur.format(p.material)}</dd></div><div><dt>Werkstattstunden</dt><dd>${eur.format(p.stunden)}</dd></div><div><dt>Montage und Anfahrt${cfg.t === 't' ? ' (Lieferung)' : ''}</dt><dd>${eur.format(p.montage)}</dd></div></dl>
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
  if (cfg.t !== 't') sel = Math.min(sel, K().n - 1);
  persist(); checkAwards();
  renderPrice(); renderHints();
  if (opts.panel !== false) renderPanel();
  if (scene && useGL) { scene.setConfig(cfg, opts.animate !== false && !reduced); scene.mark(tab === 'felder' && cfg.t !== 't' ? sel : null); }
  drawSketch(); pushToForm();
  undoB.disabled = !hist.length;
}
function edit(fn: (c: any) => void, o: { animate?: boolean } = {}) { snap(); touched = true; fn(cfg); refresh(o); }

/* ------------------------------------------------------------------ Aktionen */
function selectFeld(i: number) {
  sel = i; lastAct = '';
  if (tab !== 'felder') { tab = 'felder'; renderTabs(); }
  renderPanel(); scene?.mark(i);
  panel.querySelector<HTMLElement>('.kf.is-sel')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function vorlage(key: string) {
  snap(); touched = true;
  const n = clone(PRESETS[key]);
  if (woodChosen) Object.assign(n, { holz: cfg.holz, ober: cfg.ober, farbe: cfg.farbe, fk: cfg.fk });
  cfg = normalize(n); sel = 0;
  tab = cfg.t === 't' ? 'masse' : 'felder'; lastAct = '';
  renderTabs(); refresh({ animate: false });
  say(woodChosen ? 'Vorlage übernommen. Holz und Farbe bleiben.' : 'Vorlage übernommen.');
}
function rand() {
  const R = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  snap(); touched = true;
  const c: any = clone(PRESETS[R(VORLAGEN)[0]]);
  if (c.t === 't') {
    c.l = R([140, 160, 180, 200, 220, 240, 260]); c.q = R([70, 90, 100]); c.g = R(['v', 'k', 'w', 'x', 'z', 'b']); c.pf = R(['r', 'r', 'a', 'o']);
    c.e = c.pf === 'r' ? R(['g', 'f', 'b']) : R(['g', 'f']); c.th = 75; c.p = c.l > 240 ? 4 : R([3, 4]);
  } else {
    c.n = R([2, 3, 4, 4, 5]); c.fb = R([50, 60, 60, 70, 80]);
    c.felder = Array.from({ length: c.n }, () => { const r = Math.random(); return r < 0.35 ? { s: 3, d: 0, t: true, b: true } : r < 0.65 ? { s: 2, d: R([2, 3]), t: false, b: true } : { s: 4, d: 0, t: false, b: true }; });
    if (c.t === 's') { c.sch = R(['0', 'l', 'r', 'm']); c.sp = R(['o', 'o', 'u']); c.k = R([80, 100, 120]); c.a = R([40, 45]); c.h = R([200, 220, 230, 240]); c.tf = R([50, 60]); }
    c.fu = c.t === 'r' ? 'n' : R(['s', 'b']);
  }
  if (woodChosen) Object.assign(c, { holz: cfg.holz, ober: cfg.ober, farbe: cfg.farbe, fk: cfg.fk });
  else { c.holz = R(['e', 'n', 'a', 'k']); c.ober = R(['g', 'g', 'b', 'f']); c.farbe = R([0, 1, 2, 3]); c.fk = Math.random() < 0.5; }
  cfg = normalize(c);
  for (let i = 0; i < 3 && openWarnings(cfg); i++) checks(cfg).find((h) => h.fix)?.fix?.[0].apply(cfg);
  cfg = normalize(cfg); sel = 0; award('meister');
  refresh({ animate: false });
  scene?.setConfig(cfg, false);
}
function setView(v: View) { view = v; scene?.setView(v); renderPanel(); }
function openSheet() { $('[data-sheet-list]').innerHTML = checks(cfg).map(hintHTML).join(''); sheet.showModal?.(); }

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t === sheet) { sheet.close(); return; }
  if (t.closest('[data-close-sheet]')) { sheet.close(); return; }
  if (t.closest('[data-hintbar]')) { openSheet(); return; }
  const tabB = t.closest<HTMLElement>('[data-tab]');
  if (tabB) { tab = tabB.dataset.tab as Tab; lastAct = ''; renderTabs(); renderPanel(); scene?.mark(tab === 'felder' && cfg.t !== 't' ? sel : null); (document.getElementById('tab-' + tab) as HTMLElement)?.focus(); return; }
  const fb = t.closest<HTMLElement>('[data-feld]');
  if (fb) { selectFeld(Number(fb.dataset.feld)); return; }
  const fix = t.closest<HTMLElement>('[data-fix]');
  if (fix) { const [i, j] = fix.dataset.fix!.split('.').map(Number); const h = checks(cfg)[i]; if (h?.fix?.[j]) { snap(); h.fix[j].apply(cfg); touched = true; award('statik'); refresh(); if (step === 2) renderAbnahme(); } return; }
  const sk = t.closest<SVGElement>('.sk-pick');
  if (sk) { selectFeld(Number(sk.getAttribute('data-feld'))); return; }
  if (t.closest('[data-share-panel]')) { share(); return; }
  const b = t.closest<HTMLElement>('[data-act]');
  if (!b || !panel.contains(b)) return;
  const [a, k, v] = b.dataset.act!.split(':'); lastAct = b.dataset.act!;
  const c = cfg as any;
  const WOODKEYS = ['holz', 'ober', 'farbe', 'fk'];
  if (a === 'inc') edit(() => { c[k] += Number(v); });
  else if (a === 'set') {
    if (WOODKEYS.includes(k)) woodChosen = true;
    const val: any = k === 'fk' ? v === '1' : /^-?\d+$/.test(v) && !['sch'].includes(k) ? Number(v) : v;
    edit(() => { c[k] = val; if (k === 'ober') c.farbe = 0; if (k === 'sch' && val === 'm') c.sp = 'o'; }, { animate: !WOODKEYS.includes(k) });
  }
  else if (a === 'n') edit(() => { if (k === '1') { c.n++; c.felder.push({ s: 2, d: 0, t: false, b: true }); } else { c.n--; c.felder.pop(); sel = Math.min(sel, c.n - 1); } });
  else if (a === 'f') {
    const f: Feld = c.felder[sel];
    if (k === 's' || k === 'd') edit(() => { (f as any)[k] += Number(v); });
    else if (k === 't') { const want = !f.t; edit(() => { f.t = want; }); if (want && !(cfg as CfgKorpus).felder[sel].t) say('Dafür ist das Feld zu niedrig.'); }
    else if (k === 'b') edit(() => { f.b = !f.b; });
    else if (k === 'clear') edit(() => { f.s = 0; f.d = 0; f.t = false; f.b = false; delete f.g; });
    else if (k === 'copy') edit(() => { c.felder.forEach((x: Feld, i: number) => { if (i !== sel && !x.g) { x.s = f.s; x.d = f.d; x.t = f.t; x.b = f.b; } }); });
  }
  else if (a === 'view') setView(k as View);
  else if (a === 'vor') vorlage(k);
  else if (a === 'rand') rand();
});
panel.addEventListener('change', (e) => {
  const i = e.target as HTMLInputElement;
  if (i.dataset.act === 'steel') { lastAct = 'steel'; edit((c) => { c.x = i.checked; }); }
});
undoB.addEventListener('click', undo);
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
  $('[data-abn-hints]').innerHTML = hs.map((x) => hintHTML(x, checks(cfg).indexOf(x))).join('');
  $('[data-abn-list]').innerHTML = summary(cfg).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const p = price(cfg);
  $('[data-abn-price]').innerHTML = `<dl><div><dt>Material</dt><dd>${eur.format(p.material)}</dd></div><div><dt>Werkstattstunden</dt><dd>${eur.format(p.stunden)}</dd></div><div><dt>Montage und Anfahrt</dt><dd>${eur.format(p.montage)}</dd></div><div class="af__sum"><dt>Richtpreis ab</dt><dd>${eur.format(p.total)}</dd></div></dl><p class="kt">inkl. 19 % MwSt. Festpreis nach dem Aufmaß (89 €, bei Auftrag verrechnet).</p>`;
}

/* -------------------------------------------------------------------- Start */
renderTabs(); drawBook(); drawSketch();
refresh({ animate: false });
sheet.addEventListener('close', () => hintbar.focus?.({ preventScroll: true }));

(async () => {
  try {
    const mod = await import('./scene');
    if (!mod.hasWebGL()) throw new Error('kein WebGL');
    scene = await mod.createScene({
      canvas, base: BASE, mode: 'konstruktor', lowPower: !!weak, noFx: reduced, maxYaw: 30,
      onPick: (i) => selectFeld(i),
      onLand: () => buzz(12),
      onSlow: () => { useGL = false; stage.classList.remove('is-gl'); renderPanel(); },
    });
    useGL = true; scene.setConfig(cfg, false);
    stage.classList.add('is-gl'); renderPanel();
  } catch {
    useGL = false; stage.classList.remove('is-gl'); renderPanel();
  }
})();
