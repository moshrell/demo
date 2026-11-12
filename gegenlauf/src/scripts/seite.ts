// Логика страницы: модель → цены → Summe → заявка; чипы зон ↔ сцена; ленивая загрузка 3D; запасной режим кадрами.
// Без этого скрипта страница остаётся рабочей: цены для 986/987, таблица, форма как обычный HTML.
type Stage = Awaited<ReturnType<typeof import('../scene/stage.js')['createStage']>>;

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const nf = new Intl.NumberFormat('de-DE');
const euro = (n: number) => nf.format(n) + ' €';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get<T>(k: string, d: T): T { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k: string) { try { sessionStorage.removeItem(k); } catch {} },
};

document.documentElement.classList.add('js');
const szene = $('#szene')!;
const cfg = JSON.parse(szene.dataset.config!);
const form = $<HTMLFormElement>('#termin')!;
const modellSel = $<HTMLSelectElement>('#f-modell')!;
const posList = $$<HTMLLIElement>('.pos');
const boxOf = (li: HTMLElement) => $<HTMLInputElement>('input[type=checkbox]', li)!;
const zchips = $$<HTMLAnchorElement>('.zchip');
const zoneBlocks = $$<HTMLElement>('[data-zone-block]');

// ───────── Öffnungsstatus ─────────
function status() {
  const now = new Date(), day = now.getDay(), min = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const names = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  let text = '', offen = false;
  const today = cfg.hours.find((h: any) => h.days.includes(day));
  if (today && min >= toMin(today.open) && min < toMin(today.close)) { offen = true; text = `Jetzt geöffnet · bis ${today.close}`; }
  else if (today && min < toMin(today.open)) text = `Geschlossen · öffnet heute ${today.open}`;
  else for (let i = 1; i <= 7; i++) { const d = (day + i) % 7, h = cfg.hours.find((x: any) => x.days.includes(d)); if (h) { text = `Geschlossen · öffnet ${i === 1 ? 'morgen' : names[d]} ${h.open}`; break; } }
  $$('[data-status]').forEach((el) => { el.textContent = text; el.dataset.offen = offen ? '1' : '0'; });
}
status(); setInterval(status, 60000);

// ───────── Modell, Preise, Summe ─────────
let modell: string = store.get('gl:modell', cfg.modell);
let aktivZone: string | null = null;
const priceOf = (li: HTMLElement) => { const p = JSON.parse(li.dataset.preise!)[modell]; return typeof p === 'number' ? p : null; };
const erlaubt = (li: HTMLElement) => !li.dataset.nur || li.dataset.nur.split(',').includes(modell);

function setModell(m: string, save = true) {
  modell = m; if (save) store.set('gl:modell', m);
  modellSel.value = m;
  $$<HTMLInputElement>('input[name=modell_chip]').forEach((r) => { r.checked = r.value === m; });
  for (const li of posList) {
    const ok = erlaubt(li), box = boxOf(li);
    li.hidden = !ok; box.disabled = !ok; if (!ok) box.checked = false;
    const el = $('[data-preis]', li)!, small = $('small', el), p = priceOf(li);
    el.firstChild!.textContent = li.dataset.befund ? 'nach Befund' : p == null ? 'auf Anfrage' : 'ab ' + euro(p);
    if (small && !el.contains(small)) el.append(small);
  }
  refresh();
}

let shownSum = 0, sumAnim = 0, sumEnd = 0;
function animateSum(to: number, els: HTMLElement[], fmt: (n: number) => string) {
  cancelAnimationFrame(sumAnim); clearTimeout(sumEnd);
  if (reduced || shownSum === to) { shownSum = to; els.forEach((e) => (e.textContent = fmt(to))); return; }
  const from = shownSum, t0 = performance.now();
  const step = (now: number) => { const k = Math.min(1, (now - t0) / 380), e = 1 - Math.pow(1 - k, 3); shownSum = Math.round((from + (to - from) * e) / 5) * 5; if (k >= 1) shownSum = to; els.forEach((el) => (el.textContent = fmt(shownSum))); if (k < 1) sumAnim = requestAnimationFrame(step); };
  sumAnim = requestAnimationFrame(step);
  clearTimeout(sumEnd); sumEnd = window.setTimeout(() => { cancelAnimationFrame(sumAnim); shownSum = to; els.forEach((e) => (e.textContent = fmt(to))); }, 450); // цифра точна, даже если кадры заняты 3D
}

function gewaehlt() { return posList.filter((li) => boxOf(li).checked && !li.hidden); }
function refresh() {
  const sel = gewaehlt();
  const sum = sel.reduce((s, li) => s + (priceOf(li) ?? 0), 0);
  const offene = sel.filter((li) => priceOf(li) == null).length;
  store.set('gl:leistungen', sel.map((li) => li.dataset.id));
  // Chips: Anzahl je Bereich
  for (const c of zchips) $('[data-anzahl]', c)!.textContent = String(sel.filter((li) => li.dataset.zone === c.dataset.zone).length || '');
  // Formular: Auswahl-Liste
  const wahl = $('[data-wahl]')!;
  wahl.replaceChildren(...sel.map((li) => {
    const row = document.createElement('li'), p = priceOf(li);
    const n = document.createElement('span'); n.textContent = `${$('.pos__nr', li)!.textContent} · ${$('[data-name]', li)!.textContent}`;
    const pr = document.createElement('span'); pr.textContent = li.dataset.befund ? 'nach Befund' : p == null ? 'auf Anfrage' : 'ab ' + euro(p);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '×'; b.setAttribute('aria-label', `${$('[data-name]', li)!.textContent} entfernen`);
    b.addEventListener('click', () => { boxOf(li).checked = false; refresh(); focusScene(); });
    row.append(n, pr, b); return row;
  }));
  $('[data-wahl-leer]')!.hidden = sel.length > 0;
  const zeile = $('[data-summe-zeile]')!; zeile.hidden = sel.length === 0;
  const fmt = (n: number) => (sum === 0 && offene ? 'nach Rückruf' : 'ab ' + euro(n) + (offene ? ' +' : ''));
  // Leiste unten
  const lSum = $('[data-leiste-summe]')!, lText = $('[data-leiste-text]')!;
  if (sel.length) { lText.innerHTML = '<span class="leiste__lang">Termin </span>anfragen'; animateSum(sum, [lSum, $('[data-summe]')!], fmt); }
  else { shownSum = 0; lSum.textContent = ''; lText.textContent = 'Diagnose-Termin'; }
}

$$<HTMLInputElement>('input[name=modell_chip]').forEach((r) => r.addEventListener('change', () => { if (r.checked) setModell(r.value); }));
modellSel.addEventListener('change', () => setModell(modellSel.value));

// ───────── Zonen und Leistungen ↔ Szene ─────────
let stage: Stage | null = null;
let fallback = false;                 // Ersatzmodus: Standbilder statt 3D
let letzte: HTMLElement | null = null; // zuletzt angekreuzte Leistung (bestimmt die Kamera)

function setZone(z: string | null, scroll = false) {
  aktivZone = z; store.set('gl:zone', z);
  for (const c of zchips) c.setAttribute('aria-pressed', String(c.dataset.zone === z));
  for (const b of zoneBlocks) b.hidden = z !== null && b.dataset.zoneBlock !== z;
  if (z) szene.dataset.gewaehlt = '1';
  const chip = zchips.find((c) => c.dataset.zone === z);
  chip?.scrollIntoView({block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth'});
  if (scroll) $('#service')!.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'start'});
  focusScene();
}
function focusScene(scanNow = false) {
  const z = aktivZone;
  let teile: string[] | null = null, scan = false;
  if (letzte && boxOf(letzte).checked && !letzte.hidden && letzte.dataset.zone === z) {
    teile = JSON.parse(letzte.dataset.teile!); if (!teile!.length) teile = null;
    scan = !!letzte.dataset.scan && scanNow;
  }
  const zone3d = z && z !== 'ganz' ? z : null;
  if (stage) { if (roentgen) stage.setFocus({zone: zone3d, teile, scan: scan || (z === 'ganz' && scanNow)}); }
  else kader(zone3d);
}
zchips.forEach((c) => c.addEventListener('click', (e) => { e.preventDefault(); letzte = null; const z = c.dataset.zone!; setZone(z); if (z === 'ganz') focusScene(true); }));
for (const li of posList) boxOf(li).addEventListener('change', () => {
  const on = boxOf(li).checked;
  letzte = on ? li : null; szene.dataset.gewaehlt = '1';
  if (on && aktivZone !== li.dataset.zone) setZone(li.dataset.zone!); else focusScene(on);
  if (on && li.dataset.scan) focusScene(true);
  refresh();
});
// «Aus der Werkstatt»: случай показывает узел на машине
$$<HTMLAnchorElement>('[data-zeige-zone]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault(); letzte = null;
  setZone(a.dataset.zeigeZone!, true);
  const teile = JSON.parse(a.dataset.zeigeTeile!);
  if (stage) stage.setFocus({zone: a.dataset.zeigeZone!, teile}); else kader(a.dataset.zeigeZone!);
}));

// ───────── Скролл → прогресс «рентгена» (родной скролл, без перехвата) ─────────
const blatt = $('#service')!, buehne = $('#buehne')!;
let roentgen = false, ticking = false;
function progress() {
  const vh = innerHeight, sr = szene.getBoundingClientRect(), br = blatt.getBoundingClientRect(), wr = buehne.getBoundingClientRect();
  const twoCol = sr.height > vh * 0.8;
  const stuckBottom = twoCol ? vh * 0.32 : sr.height;
  const docTop = br.top + scrollY, s1 = Math.max(60, docTop - stuckBottom - 24), s0 = s1 * 0.12;
  const tIn = (scrollY - s0) / (s1 - s0);
  const tOut = (wr.bottom - (twoCol ? vh * 0.75 : sr.height) - 16) / (vh * 0.28);
  return Math.max(0, Math.min(1, tIn, tOut));
}
function onScroll() {
  ticking = false;
  const t = progress();
  stage?.setScroll(t);
  const r = t > 0.6;
  if (r !== roentgen) { roentgen = r; szene.dataset.roentgen = r ? '1' : '0'; if (!stage) kader(aktivZone && aktivZone !== 'ganz' ? aktivZone : null); else if (r) focusScene(); else stage.setFocus({}); }
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, {passive: true});
addEventListener('resize', () => onScroll(), {passive: true});

// ───────── Запасной режим: кадры из этой же сцены ─────────
const bildA = $<HTMLImageElement>('[data-bild-a]')!, bildB = $<HTMLImageElement>('[data-bild-b]')!;
let kaderJetzt = 'poster';
function kader(zone: string | null) {
  if (stage) return;
  const name = !roentgen ? 'poster' : zone || 'xray';
  if (name === kaderJetzt) return; kaderJetzt = name;
  if (name === 'poster') { bildB.style.opacity = '0'; bildA.style.opacity = '1'; return; }
  const src = `${cfg.kader}${name}.webp`;
  const show = () => { if (kaderJetzt !== name) return; bildB.style.objectFit = ['motor', 'getriebe', 'abgas'].includes(name) ? 'cover' : 'contain'; bildB.style.opacity = '1'; bildA.style.opacity = '0'; };
  if (bildB.getAttribute('src') === src) return show();
  const pre = new Image(); pre.onload = () => { if (kaderJetzt !== name) return; bildB.src = src; requestAnimationFrame(show); }; pre.src = src;
}

// ───────── Ленивая загрузка 3D после первой отрисовки ─────────
function webgl() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch { return false; } }
async function ladeSzene() {
  const con = (navigator as any).connection;
  const langsam = con && (con.saveData || /(^|-)2g$/.test(con.effectiveType || ''));
  if (langsam || !webgl()) { fallback = true; szene.dataset.live = '0'; onScroll(); return; }
  const balken = $('[data-lade]')!;
  try {
    const {createStage} = await import('../scene/stage.js');
    stage = await createStage($<HTMLCanvasElement>('canvas', szene)!, {
      modelUrl: cfg.modelUrl, dims: cfg.dims, reduced,
      onProgress: (p: number) => { balken.style.transform = `scaleX(${0.08 + 0.92 * p})`; },
      onTooSlow: () => { stage = null; fallback = true; szene.dataset.live = '0'; kaderJetzt = ''; onScroll(); kader(aktivZone && aktivZone !== 'ganz' ? aktivZone : null); },
    });
    stage.setScroll(progress());
    if (aktivZone && roentgen) focusScene();
    szene.dataset.live = '1';
    bildB.style.opacity = '0'; kaderJetzt = 'poster';
    if (!store.get('gl:wach', false) && scrollY < 40) { stage.wake(); store.set('gl:wach', true); addEventListener('pointerdown', () => stage?.stopWake(), {once: true, passive: true}); }
    (window as any).__stage = stage;
  } catch (err) {
    console.warn('3D-Szene nicht geladen, Standbilder bleiben aktiv', err);
    fallback = true; szene.dataset.live = '0'; stage = null;
  }
  (window as any).__szeneFertig = true;
}
const start = () => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(ladeSzene, {timeout: 1200}) : setTimeout(ladeSzene, 200));
if (new URLSearchParams(location.search).has('ohne3d')) { fallback = true; szene.dataset.live = '0'; (window as any).__szeneFertig = true; }
else if (document.readyState === 'complete') start(); else addEventListener('load', start, {once: true});

// ───────── Diagnose-Termin (schneller Weg) und Leiste ─────────
$('[data-ziel]')!.addEventListener('click', (e) => {
  e.preventDefault();
  if (!gewaehlt().length) { const d = posList.find((li) => li.dataset.id === 'fehlerdiagnose'); if (d && !d.hidden) { boxOf(d).checked = true; refresh(); } }
  $('#termin')!.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'start'});
  const ziel = gewaehlt().some((li) => li.dataset.id === 'fehlerdiagnose') && gewaehlt().length === 1 ? $('#f-problem')! : $('#f-jahr')!;
  setTimeout(() => ziel.focus({preventScroll: true}), reduced ? 0 : 450);
});

// ───────── Wunschwoche: nächste vier Wochen ─────────
(() => {
  const wrap = $('[data-wochen]')!, inp = $<HTMLInputElement>('#f-wunsch')!;
  const kw = (d: Date) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((+t - +y0) / 864e5 + 1) / 7); };
  const mon = new Date(); mon.setDate(mon.getDate() + ((8 - (mon.getDay() || 7)) % 7 || 7));
  for (let i = 0; i < 4; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i * 7);
    const b = document.createElement('button'); b.type = 'button';
    const label = `KW ${kw(d)}, ab ${d.getDate()}.${d.getMonth() + 1}.`;
    b.textContent = label; b.addEventListener('click', () => { inp.value = label; inp.dispatchEvent(new Event('input', {bubbles: true})); });
    wrap.append(b);
  }
  wrap.hidden = false;
})();

// ───────── Formular: Prüfung, Bestätigung, Zwischenspeicher ─────────
const fertig = $('[data-fertig]')!, liste = $('[data-fertig-liste]')!;
const feld = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
const fehler = (i: HTMLInputElement, show: boolean) => {
  const e = document.getElementById((i.getAttribute('aria-describedby') || '').split(' ')[0]);
  if (e && e.classList.contains('ta__err')) e.hidden = !show;
  i.setAttribute('aria-invalid', show ? 'true' : 'false');
  i.closest('.ta__check')?.classList.toggle('is-invalid', show);
};
['name', 'tel', 'email', 'baujahr'].forEach((n) => feld(n).addEventListener('input', () => fehler(feld(n), false)));
feld('privacy').addEventListener('change', () => fehler(feld('privacy'), false));

const KEY = 'gl:formular';
const gespeichert = () => [...form.elements].filter((el): el is HTMLInputElement => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !!el.name && !['privacy', 'leistung', 'foto'].includes(el.name));
const sichern = () => { const d: Record<string, string | boolean> = {}; gespeichert().forEach((el) => { d[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); store.set(KEY, d); };
(() => { const d = store.get<Record<string, string | boolean>>(KEY, {}); gespeichert().forEach((el) => { if (!(el.name in d)) return; if (el.type === 'checkbox') el.checked = !!d[el.name]; else el.value = String(d[el.name]); }); })();
form.addEventListener('input', sichern); form.addEventListener('change', sichern);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = feld('name'), tel = feld('tel'), mail = feld('email'), jahr = feld('baujahr'), priv = feld('privacy');
  const bad: HTMLInputElement[] = [];
  const check = (i: HTMLInputElement, ok: boolean) => { fehler(i, !ok); if (!ok) bad.push(i); };
  check(jahr, jahr.value.trim() === '' || /^(19|20)\d\d$/.test(jahr.value.trim()));
  check(name, name.value.trim().length > 1);
  check(tel, tel.value.replace(/\D/g, '').length >= 6);
  check(mail, mail.value.trim() === '' || mail.checkValidity());
  check(priv, priv.checked);
  if (bad.length) { bad[0].focus(); return; }
  const sel = gewaehlt(), sum = sel.reduce((s, li) => s + (priceOf(li) ?? 0), 0), offene = sel.some((li) => priceOf(li) == null);
  const rows: [string, string, boolean?][] = [];
  rows.push(['Modell', modellSel.selectedOptions[0].textContent + (jahr.value ? `, ${jahr.value}` : '') + (feld('km').value ? `, ${feld('km').value} km` : '')]);
  sel.forEach((li) => { const p = priceOf(li); rows.push([$('[data-name]', li)!.textContent!, li.dataset.befund ? 'nach Befund' : p == null ? 'auf Anfrage' : 'ab ' + euro(p)]); });
  if (sel.length) rows.push(['Summe', sum === 0 && offene ? 'nach Rückruf' : 'ab ' + euro(sum) + (offene ? ' + Positionen nach Befund' : ''), true]);
  if (feld('problem').value.trim()) rows.push(['Beschreibung', feld('problem').value.trim()]);
  if (feld('wunsch').value.trim()) rows.push(['Wunschtermin', feld('wunsch').value.trim()]);
  if (feld('holbring').checked) rows.push(['Hol- und Bringservice', 'ja']);
  rows.push(['Name', name.value.trim()], ['Telefon', tel.value.trim()]);
  liste.replaceChildren(...rows.map(([k, v, stark]) => {
    const d = document.createElement('div'); if (stark) d.className = 'ta__gesamt';
    const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; d.append(dt, dd); return d;
  }));
  form.hidden = true; fertig.hidden = false; fertig.focus();
  store.del(KEY); store.del('gl:leistungen');
});
$('[data-neu]')!.addEventListener('click', () => {
  form.reset(); posList.forEach((li) => (boxOf(li).checked = false)); letzte = null;
  fertig.hidden = true; form.hidden = false; setModell(modell); focusScene();
  $('#f-jahr')!.focus();
});

// ───────── Start: gespeicherte Auswahl wiederherstellen ─────────
const gemerkt: string[] = store.get('gl:leistungen', []);
posList.forEach((li) => { if (gemerkt.includes(li.dataset.id!)) boxOf(li).checked = true; });
setModell(modell, false);
setZone(store.get<string | null>('gl:zone', null) ?? 'motor');
szene.dataset.gewaehlt = gemerkt.length ? '1' : '0';
onScroll();
