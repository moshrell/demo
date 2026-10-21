import plz from '../data/plz.json';
import zonen from '../data/zonen.json';
const P = plz as Record<string, [string, number]>;
export interface ZoneResult { z: 'ok' | 'maybe' | 'no'; text: string; ort: string; anfahrt?: number }
/** PLZ -> Zone (Luftlinie zur Werkstatt, GeoNames-Daten) oder null, wenn keine 5 Ziffern */
export function zoneFor(code: string): ZoneResult | null {
  if (!/^\d{5}$/.test(code)) return null;
  const hit = P[code];
  if (!hit) return { z: 'no', text: zonen.no, ort: '' };
  const [ort, km] = hit;
  const zn = zonen.zones.find((x) => km <= x.max);
  if (!zn) return { z: 'no', text: zonen.no, ort };
  return { z: zn.anfahrt >= 95 ? 'maybe' : 'ok', text: `${ort}: ${zn.text}`, ort, anfahrt: zn.anfahrt };
}
