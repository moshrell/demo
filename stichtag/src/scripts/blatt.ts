import fristen from '../data/fristen.json';
import opt from '../data/optionen.json';
import hon from '../data/honorar.json';
import unt from '../data/unterlagen.json';
import { MONATE, state, complete, eff, save, shareUrl, eur, base, label, esc, positionen, summen, type Key, type Eff } from './blatt-core';

// ——— Fristen ———
type Entry = typeof fristen[number];
const gilt = (en: Entry, e: Eff) => (en.rf === 'alle' || (en.rf as string[]).includes(e.rf)) && (!en.ma || e.ma !== '0');
const dmy = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
function naechster(e: Eff) {
  const t = new Date(); const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  let best: { d: string; en: Entry; note: string } | null = null;
  for (const en of fristen) if (gilt(en, e)) for (const d of en.dates) if (d.d >= today && (!best || d.d < best.d)) best = { d: d.d, en, note: d.note };
  if (!best) return null;
  const days = Math.round((Date.parse(best.d) - Date.parse(today)) / 86400000);
  return { ...best, days };
}
const inTagen = (n: number) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

function fristenHtml(e: Eff) {
  const nx = naechster(e);
  const byMonth: { d: string; en: Entry; note: string }[][] = Array.from({ length: 12 }, () => []);
  for (const en of fristen) if (gilt(en, e)) for (const d of en.dates) byMonth[Number(d.d.slice(5, 7)) - 1].push({ d: d.d, en, note: d.note });
  const months = byMonth.map((arr, i) => {
    arr.sort((a, b) => a.d.localeCompare(b.d) || a.en.label.localeCompare(b.en.label));
    const items = arr.map((x) => {
      const isNext = nx && nx.d === x.d && nx.en.id === x.en.id;
      return `<li><details class="termin${isNext ? ' is-next' : ''}"><summary><span class="termin__d">${Number(x.d.slice(8, 10))}.</span><span class="termin__n">${esc(x.en.label)}<small>${esc(x.note)}</small></span></summary>
        <dl><div><dt>Was ist das?</dt><dd>${esc(x.en.was)}</dd></div><div><dt>Wer bei uns?</dt><dd>${esc(x.en.wer)}</dd></div><div><dt>Was wir von Ihnen brauchen</dt><dd>${esc(x.en.brauchen)}</dd></div></dl></details></li>`;
    }).join('');
    return `<section class="monat" aria-labelledby="m${i}"><h3 id="m${i}">${MONATE[i]}</h3><ul>${items}</ul></section>`;
  }).join('');
  const banner = nx
    ? `<p class="naechster"><span class="naechster__d">${dmy(nx.d).slice(0, 6)}</span><span class="naechster__t">${esc(nx.en.label)}, ${esc(nx.note)}<small>Nächster Termin dieses Blatts, ${inTagen(nx.days)}</small></span></p>`
    : `<p class="naechster"><span class="naechster__d">2027</span><span class="naechster__t">Alle Termine dieses Blatts liegen in der Vergangenheit<small>Das Blatt gilt für das Steuerjahr 2027.</small></span></p>`;
  return `${banner}<div class="monate">${months}</div>
    <div class="vergleich"><h3>Erklärungen für 2026: Fristen im Vergleich</h3>
      <div class="balken">
        <div class="balken__r"><span class="balken__l">Ohne Steuerberater: 2. August 2027</span><div class="balken__b balken__b--50 balken__b--ohne" role="presentation"></div></div>
        <div class="balken__r"><span class="balken__l">Mit Steuerberater: 29. Februar 2028</span><div class="balken__b balken__b--100" role="presentation"></div></div>
      </div>
      <p class="muted">Knapp sieben Monate mehr Zeit für die Erklärungen 2026, wenn ein Steuerberater sie erstellt. Gilt für Einkommen-, Körperschaft-, Gewerbe- und Umsatzsteuer.</p></div>`;
}

// ——— Rendering ———
function posHtml(e: Eff) {
  return positionen(e).map((p) => {
    const off = !p.fest && state.off.includes(p.id);
    const price = `${eur.format(p.eur)}${p.per === 'Monat' && e.bel === 'bmehr' && p.id === 'fibu' ? ' <small>ab</small>' : ''} <small>/ ${p.per === 'einmalig' ? 'einmalig' : p.per}</small>`;
    return `<li class="pos__r${p.fest ? ' pos__r--fest' : ''}${off ? ' pos__r--off' : ''}"><label class="pos__l"><input type="checkbox" data-pos="${p.id}" ${off ? '' : 'checked'} ${p.fest ? 'disabled' : ''}><span class="pos__n">${esc(p.label)}<small>${p.fest ? 'immer enthalten. ' : ''}${esc(p.sub)}</small></span></label><span class="pos__p">${price}</span></li>`;
  }).join('');
}
function summeHtml(e: Eff) {
  const s = summen(e); const ab = e.bel === 'bmehr' ? 'ab ' : '';
  return `<div class="summe__haupt"><dt>Summe pro Monat</dt><dd>${ab}${eur.format(s.monat)}</dd></div>
    <div><dt>dazu einmal im Jahr</dt><dd>${eur.format(s.jahr)}</dd></div>
    ${s.einmalig ? `<div><dt>dazu einmalig</dt><dd>${eur.format(s.einmalig)}</dd></div>` : ''}
    <div><dt>Gesamt im ersten Jahr (12 Monate)</dt><dd>${ab}${eur.format(s.monat * 12 + s.jahr + s.einmalig)}</dd></div>`;
}
function docsHtml(e: Eff) {
  const list = [...unt.alle, ...((unt.rf as Record<string, string[]>)[e.rf] || []), ...(e.ma !== '0' ? unt.ma : []), ...(((unt.bel as Record<string, string[]>)[e.bel]) || [])];
  return list.map((t) => `<li>${esc(t)}</li>`).join('');
}
function kontaktHref() {
  const q = new URLSearchParams(); const s = state;
  if (s.rf) q.set('rf', s.rf); if (s.ma) q.set('ma', s.ma); if (s.bel) q.set('b', s.bel); if (s.off.length) q.set('ab', s.off.join(','));
  return `${base}kontakt/${q.toString() ? '?' + q : ''}`;
}

const root = document.getElementById('ergebnis') as HTMLElement;
let fresh = false;
function render() {
  const e = eff(); const ok = complete();
  const offen = (['rf', 'ma', 'bel'] as Key[]).map((k, i) => (state[k] ? '' : String(i + 1))).filter(Boolean);
  const kopf = ok
    ? `<p class="hinweis"><strong>Ihr Blatt:</strong> ${esc(label(opt.rf, e.rf))}, ${esc(label(opt.ma, e.ma))} Mitarbeitende, ${esc(label(opt.bel, e.bel))} Belege im Monat.</p>
       <div class="teilen no-print"><button class="btn btn--ghost" type="button" data-share>Link zu diesem Blatt kopieren</button><output aria-live="polite" data-share-out></output></div>`
    : `<p class="hinweis"><strong>Beispielblatt:</strong> ${esc(label(opt.rf, e.rf))}, ${esc(label(opt.ma, e.ma))} Mitarbeitende, ${esc(label(opt.bel, e.bel))} Belege im Monat. ${offen.length ? `Füllen Sie ${offen.length > 1 ? 'die Zeilen' : 'die Zeile'} ${offen.join(' und ')} aus, dann gilt das Blatt für Sie.` : ''}</p>`;
  const ab = e.bel === 'bmehr' ? 'ab ' : ''; const s = summen(e);
  root.className = fresh ? 'is-fresh' : '';
  root.innerHTML = `
    <section class="z${fresh ? ' z--frisch' : ''}" id="fristen" style="--i:0"><div class="z__b"><h2>Ihr Steuerjahr 2027</h2>${kopf}${fristenHtml(e)}</div></section>
    <section class="z${fresh ? ' z--frisch' : ''}" id="leistungen-blatt" style="--i:1"><div class="z__b"><h2>Was wir übernehmen</h2>
      <p class="muted">Nehmen Sie den Haken heraus, was Sie selbst erledigen. Die Summe rechnet mit.</p>
      <ul class="pos" data-pos-list>${posHtml(e)}</ul>
      <div class="pos__r pos__r--fest" style="grid-template-columns:minmax(0,1fr)"><span class="pos__n">${esc(hon.pruefung.label)}<small>${esc(hon.pruefung.text)}</small></span></div>
      <dl class="summe" data-summe style="margin-top:1rem">${summeHtml(e)}</dl>
      <p class="muted" style="font-size:.9rem">${esc(hon.hinweis)} Die Vergütung wird vor Beginn in Textform vereinbart (§ 4 StBVV).</p></div></section>
    <section class="z${fresh ? ' z--frisch' : ''}" id="unterlagen" style="--i:2"><div class="z__b"><h2>Unterlagen für das Erstgespräch</h2>
      <p class="print-kopf">Ollenhauer &amp; Brink Steuerberater PartG mbB (Demo). ${esc(label(opt.rf, e.rf))}, ${esc(label(opt.ma, e.ma))} Mitarbeitende, ${esc(label(opt.bel, e.bel))} Belege im Monat.</p>
      <ul class="docs">${docsHtml(e)}</ul>
      <button class="btn btn--ghost no-print" type="button" data-print>Liste drucken oder als PDF sichern</button></div></section>
    <section class="z${fresh ? ' z--frisch' : ''}" id="anfrage" style="--i:3"><div class="z__b"><h2>Erstgespräch anfragen</h2>
      <p>Ihre Angaben und die Summe werden in die Anfrage übernommen. Wir melden uns innerhalb eines Werktags.</p>
      <a class="btn" href="${kontaktHref()}" data-kontakt>Erstgespräch anfragen</a></div></section>
    <div class="bar no-print"><p class="bar__s"><small>${ok ? 'Ihr Richtwert' : 'Beispiel'}</small><strong data-bar>${ab}${eur.format(s.monat)} im Monat</strong><small>dazu ${eur.format(s.jahr)} im Jahr${s.einmalig ? ' und ' + eur.format(s.einmalig) + ' einmalig' : ''}</small></p><a class="btn" href="${kontaktHref()}" data-kontakt>Erstgespräch anfragen</a></div>`;
  fresh = false;
}

function refreshSums() {
  const e = eff(); const s = summen(e); const ab = e.bel === 'bmehr' ? 'ab ' : '';
  const sm = root.querySelector('[data-summe]'); if (sm) sm.innerHTML = summeHtml(e);
  const bar = root.querySelector('.bar__s'); if (bar) bar.innerHTML = `<small>${complete() ? 'Ihr Richtwert' : 'Beispiel'}</small><strong data-bar>${ab}${eur.format(s.monat)} im Monat</strong><small>dazu ${eur.format(s.jahr)} im Jahr${s.einmalig ? ' und ' + eur.format(s.einmalig) + ' einmalig' : ''}</small>`;
  root.querySelectorAll<HTMLAnchorElement>('[data-kontakt]').forEach((a) => (a.href = kontaktHref()));
}

// ——— Ereignisse ———
const form = document.getElementById('blatt-form') as HTMLFormElement;
(['rf', 'ma', 'bel'] as Key[]).forEach((k) => {
  const name = k === 'bel' ? 'bel' : k;
  const v = state[k];
  if (v) { const r = form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${v}"]`); if (r) r.checked = true; }
});
form.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement; if (t.type !== 'radio') return;
  const wasComplete = complete();
  (state as any)[t.name as Key] = t.value;
  if (t.name === 'rf') state.off = []; // andere Positionen, andere Haken
  save();
  fresh = !wasComplete && complete();
  render();
  if (fresh || (!wasComplete && complete())) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('fristen')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
});
root.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (!t.matches('input[data-pos]')) return;
  const id = t.dataset.pos!;
  state.off = t.checked ? state.off.filter((x) => x !== id) : [...state.off, id];
  t.closest('.pos__r')?.classList.toggle('pos__r--off', !t.checked);
  save(); refreshSums();
});
root.addEventListener('click', async (ev) => {
  const el = ev.target as HTMLElement;
  if (el.closest('[data-print]')) {
    document.documentElement.classList.add('druck-unterlagen');
    const done = () => { document.documentElement.classList.remove('druck-unterlagen'); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    window.print();
  }
  if (el.closest('[data-share]')) {
    const out = root.querySelector<HTMLElement>('[data-share-out]')!;
    try { await navigator.clipboard.writeText(shareUrl()); out.textContent = 'Link kopiert.'; }
    catch {
      out.textContent = '';
      const wrap = root.querySelector('.teilen')!;
      if (!wrap.querySelector('input')) { const i = document.createElement('input'); i.readOnly = true; i.value = shareUrl(); i.setAttribute('aria-label', 'Link zu diesem Blatt'); wrap.append(i); i.focus(); i.select(); }
    }
  }
});
try { history.scrollRestoration = 'manual'; } catch {}
save();
render();
document.documentElement.dataset.blatt = complete() ? 'komplett' : 'beispiel';
