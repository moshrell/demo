// «Ihr Steuerjahr auf einem Blatt»: drei Angaben, dann Fristen 2027, Leistungen mit Honorar-Richtwert, Unterlagenliste.
// Zustand: URL (?rf=&ma=&b=&ab=) und sessionStorage. Nichts verlässt den Browser.
import opt from '../data/optionen.json';
import hon from '../data/honorar.json';
import unt from '../data/unterlagen.json';

export type Key = 'rf' | 'ma' | 'bel';
export type State = { rf: string | null; ma: string | null; bel: string | null; off: string[] };
export type Eff = { rf: string; ma: string; bel: string };

export const KEY = 'stichtag:blatt';
export const base = (document.documentElement.dataset.base || '/');
export const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const label = (list: { id: string; label: string }[], id: string) => list.find((o) => o.id === id)?.label ?? id;
export const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const valid = (k: Key, v: string | null) => (v && (opt[k] as { id: string }[]).some((o) => o.id === v) ? v : null);

function load(): State {
  const s: State = { rf: null, ma: null, bel: null, off: [] };
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('rf') || q.has('ma') || q.has('b')) {
      s.rf = valid('rf', q.get('rf')); s.ma = valid('ma', q.get('ma')); s.bel = valid('bel', q.get('b'));
      s.off = (q.get('ab') || '').split(',').filter(Boolean);
      return s;
    }
  } catch {}
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); return { rf: valid('rf', d.rf), ma: valid('ma', d.ma), bel: valid('bel', d.bel), off: Array.isArray(d.off) ? d.off : [] }; }
  } catch {}
  return s;
}
export const state = load();
export const complete = () => !!(state.rf && state.ma && state.bel);
export const eff = (): Eff => ({ rf: state.rf ?? opt.default.rf, ma: state.ma ?? opt.default.ma, bel: state.bel ?? opt.default.bel });

export function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  try {
    const q = new URLSearchParams();
    if (state.rf) q.set('rf', state.rf);
    if (state.ma) q.set('ma', state.ma);
    if (state.bel) q.set('b', state.bel);
    if (state.off.length) q.set('ab', state.off.join(','));
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  } catch {}
}
export const shareUrl = () => location.origin + location.pathname + location.search;

// ——— Honorar ———
type Pos = { id: string; label: string; sub: string; per: 'Monat' | 'Jahr' | 'einmalig'; eur: number; fest?: boolean };
export function positionen(e: Eff): Pos[] {
  const p: Pos[] = [];
  p.push({ id: 'fibu', label: 'Laufende Finanzbuchhaltung', sub: 'Belege buchen, Auswertung (BWA) jeden Monat', per: 'Monat', eur: (hon.fibu as Record<string, number>)[e.bel], fest: true });
  p.push({ id: 'ustva', label: 'Umsatzsteuer-Voranmeldungen', sub: 'Abgabe vor jeder Frist, Hinweis auf die Zahllast', per: 'Monat', eur: hon.ustva });
  if (e.ma !== '0') {
    const l = (hon.lohn as Record<string, { personen: number; je: number }>)[e.ma];
    p.push({ id: 'lohn', label: 'Lohnabrechnung', sub: `Rechenbeispiel: ${l.personen} Personen zu je ${l.je} €`, per: 'Monat', eur: l.personen * l.je });
  }
  const a = (hon.abschluss as Record<string, { label: string; eur: number }>)[e.rf];
  p.push({ id: 'abschluss', label: a.label, sub: 'einmal im Jahr', per: 'Jahr', eur: a.eur });
  const x = (hon.erklaerung as Record<string, { label: string; eur: number }>)[e.rf];
  p.push({ id: 'erkl', label: x.label, sub: 'einmal im Jahr', per: 'Jahr', eur: x.eur });
  if (e.rf === 'gruend') p.push({ id: 'gruend', label: hon.gruendung.label, sub: 'einmalig, vor dem Start', per: 'einmalig', eur: hon.gruendung.eur });
  return p;
}
export function summen(e: Eff) {
  const pos = positionen(e).filter((p) => p.fest || !state.off.includes(p.id));
  const sum = (per: string) => pos.filter((p) => p.per === per).reduce((s, p) => s + p.eur, 0);
  return { monat: sum('Monat'), jahr: sum('Jahr'), einmalig: sum('einmalig') };
}
export function blattZusammenfassung() {
  const e = eff(); const s = summen(e);
  return { complete: complete(), e, s, zeilen: [
    ['Rechtsform', label(opt.rf, e.rf)], ['Mitarbeitende', label(opt.ma, e.ma)], ['Belege pro Monat', label(opt.bel, e.bel)],
    ['Richtwert pro Monat', (e.bel === 'bmehr' ? 'ab ' : '') + eur.format(s.monat)], ['dazu pro Jahr', eur.format(s.jahr)],
  ] as [string, string][] };
}

