// Общая «корзина» сайта: зоны шугаринга, процедуры лица, доп. услуги. Живёт в sessionStorage (только эта вкладка).
// Событие 'zf:cart' на window при каждом изменении. Ничего никуда не отправляется.
import zonenData from '../data/zonen.json';
import behData from '../data/behandlungen.json';
import zusatzData from '../data/zusatz.json';

export type Item = { id: string; name: string; min: number; preis: number; art: 'zone' | 'beh' | 'zusatz'; gesicht?: boolean; ab?: boolean; g?: string };
export type Line = Item & { gratis?: boolean };
export type Kombi = { durch: Item; ersetzt: string[]; spart: number };

const KEY = 'zf-cart-v1';
export const ZONEN: Item[] = zonenData.zonen.map((z: any) => ({ id: z.id, name: z.name, min: z.min, preis: z.preis, art: 'zone', gesicht: z.seite === 'gesicht' || z.id.endsWith('-gesicht'), ab: !!z.ab, g: z.g }));
const KOMBI = zonenData.zonen.filter((z: any) => z.ersetzt) as any[];
export const BEH: Item[] = behData.behandlungen.map((b: any) => ({ id: b.id, name: b.name, min: b.min, preis: b.preis, art: 'beh' }));
export const ZUSATZ: Item[] = zusatzData.gruppen.flatMap((g: any) => g.items.map((x: any) => ({ ...x, art: 'zusatz' })));
const ALL = new Map<string, Item>([...ZONEN, ...BEH, ...ZUSATZ].map((i) => [i.id, i]));
export const item = (id: string) => ALL.get(id);
export const coveredBy = (id: string) => KOMBI.find((k) => k.ersetzt.includes(id))?.id as string | undefined;

let ids: string[] = [];
let dismissed: string[] = [];
function load() {
  try { const r = JSON.parse(sessionStorage.getItem(KEY) || '{}'); ids = (r.ids || []).filter((i: string) => ALL.has(i)); dismissed = r.dismissed || []; } catch { ids = []; }
  const u = new URLSearchParams(location.search).get('auswahl');
  if (u) u.split(',').forEach((i) => { if (ALL.has(i) && !ids.includes(i)) ids.push(i); });
}
function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ids, dismissed })); } catch {}
  window.dispatchEvent(new CustomEvent('zf:cart', { detail: get() }));
}
load();

export const has = (id: string) => ids.includes(id);
/** Выбрана сама зона или покрыта выбранной комбинацией (Beine komplett, Gesicht komplett). */
export const active = (id: string) => has(id) || (!!coveredBy(id) && has(coveredBy(id)!));
export function toggle(id: string) {
  const k = coveredBy(id);
  if (k && has(k)) {
    // зона входит в выбранную комбинацию: снять комбинацию, оставить остальные части
    ids = ids.filter((i) => i !== k);
    const rest = KOMBI.find((x) => x.id === k)!.ersetzt.filter((p: string) => p !== id);
    rest.forEach((p: string) => { if (!ids.includes(p)) ids.push(p); });
  } else if (has(id)) {
    ids = ids.filter((i) => i !== id);
  } else {
    const kombi = KOMBI.find((x) => x.id === id);
    if (kombi) ids = ids.filter((i) => !kombi.ersetzt.includes(i));
    ids.push(id);
  }
  save();
}
export function add(id: string) { if (!has(id)) toggle(id); }
export function remove(id: string) { if (has(id)) { ids = ids.filter((i) => i !== id); save(); } }
export function clear() { ids = []; save(); }
export function dismissKombi(id: string) { dismissed.push(id); save(); }

/** Подсказка комбинации: все части выбраны (regel alle) или сумма частей ≥ цены комплекта (regel summe). */
export function kombiHint(): Kombi | null {
  for (const k of KOMBI) {
    if (has(k.id) || dismissed.includes(k.id)) continue;
    const sel = k.ersetzt.filter((p: string) => has(p));
    const sum = sel.reduce((s: number, p: string) => s + item(p)!.preis, 0);
    const ok = k.regel === 'alle' ? sel.length === k.ersetzt.length : sel.length >= 2 && sum >= k.preis;
    if (ok && sum > k.preis) return { durch: item(k.id)!, ersetzt: sel, spart: sum - k.preis };
  }
  return null;
}
export function applyKombi(id: string) {
  const k = KOMBI.find((x) => x.id === id); if (!k) return;
  ids = ids.filter((i) => !k.ersetzt.includes(i)); if (!ids.includes(id)) ids.push(id); save();
}

export function get() {
  const hatGesichtBeh = ids.some((i) => item(i)?.art === 'beh');
  const lines: Line[] = ids.map((i) => ({ ...item(i)!, gratis: hatGesichtBeh && !!item(i)!.gesicht }));
  const summe = lines.reduce((s, l) => s + (l.gratis ? 0 : l.preis), 0);
  const min = lines.reduce((s, l) => s + l.min, 0);
  return { ids: [...ids], lines, summe, min, ab: lines.some((l) => l.ab) };
}

const e0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const e2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
export const euro = (n: number) => (Number.isInteger(n) ? e0 : e2).format(n);
export function dauer(min: number) {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}
export const anzahl = (n: number) => `${n} ${n === 1 ? 'Leistung' : 'Leistungen'}`;
