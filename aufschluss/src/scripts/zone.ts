import data from '../data/zonen.json';
export interface ZoneInfo { ok: boolean; zone?: number; anfahrt?: number; ort?: string; text: string }
export function zoneFuer(plzRaw: string): ZoneInfo | null {
  const plz = plzRaw.replace(/\D/g, '');
  if (plz.length < 5) return null;
  const n = Number(plz);
  if (data.stadtBereiche.some(([a, b]) => n >= a && n <= b)) {
    return { ok: true, zone: 1, anfahrt: 0, ort: 'Hannover', text: `${plz} Hannover · Zone 1 · Anfahrt 0 €` };
  }
  const o = data.orte.find((x) => x.plz === plz);
  if (o) {
    const z = data.zonen.find((x) => x.zone === o.zone)!;
    return { ok: true, zone: z.zone, anfahrt: z.anfahrt, ort: o.ort, text: `${plz} ${o.ort} · Zone ${z.zone} · Anfahrt ${z.anfahrt} €` };
  }
  return { ok: false, text: `${plz}: ${data.ausserhalb}` };
}
export const euro = (n: number) => `${n.toLocaleString('de-DE')} €`;
