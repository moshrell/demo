// Grundstück per Adresse: Photon (OSM) → LGLN ALKIS vereinfacht (WFS, GML 3.2, EPSG:25832).
// Wiederverwendbar (siehe _briefs/_module/grundstueck-adresse.txt). Keine Daten werden gespeichert.
import proj4 from 'proj4';

export type Pt = [number, number]; // Meter, lokal: x nach Osten, y nach Süden (SVG-Richtung)
export interface Parcel { id: string; ring: Pt[]; area: number; label: string; gemarkung: string; flur: string; nr: string; use: string; }
export interface Place { label: string; lat: number; lon: number; }

proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toUtm = (lon: number, lat: number) => proj4('EPSG:4326', 'EPSG:25832', [lon, lat]) as [number, number];

const WFS = 'https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wfs_einfach';
const PHOTON = 'https://photon.komoot.io/api/';
const NDS_BBOX = '6.6,51.29,11.6,53.9';

export async function geocode(q: string, signal?: AbortSignal): Promise<Place[]> {
  const u = `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lang=de&bbox=${NDS_BBOX}`;
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error('geocode');
  const j = await r.json();
  const seen = new Set<string>();
  return (j.features || [])
    .filter((f: any) => f.properties?.state === 'Niedersachsen')
    .map((f: any) => {
      const p = f.properties;
      const street = [p.street || p.name, p.housenumber].filter(Boolean).join(' ');
      const label = [street, [p.postcode, p.city || p.district].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      return { label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    })
    .filter((p: Place) => (seen.has(p.label) ? false : (seen.add(p.label), true)));
}

async function wfs(type: string, lat: number, lon: number, r: number, signal?: AbortSignal) {
  const dLat = r / 111320, dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon},urn:ogc:def:crs:EPSG::4326`;
  const u = `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${type}&COUNT=80&BBOX=${encodeURIComponent(bbox)}`;
  const res = await fetch(u, { signal });
  if (!res.ok) throw new Error('wfs');
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('wfs-parse');
  return [...xml.getElementsByTagNameNS('*', 'member')].map((m) => m.firstElementChild as Element).filter(Boolean);
}
const txt = (el: Element, name: string) => el.getElementsByTagNameNS('*', name)[0]?.textContent?.trim() || '';
const ringOf = (el: Element, ox: number, oy: number): Pt[] => {
  const pos = el.getElementsByTagNameNS('*', 'exterior')[0]?.getElementsByTagNameNS('*', 'posList')[0]?.textContent;
  if (!pos) return [];
  const n = pos.trim().split(/\s+/).map(Number);
  const ring: Pt[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) ring.push([n[i] - ox, oy - n[i + 1]]);
  if (ring.length > 2) { const a = ring[0], b = ring[ring.length - 1]; if (a[0] === b[0] && a[1] === b[1]) ring.pop(); }
  return ring;
};

export async function loadParcels(place: Place, signal?: AbortSignal) {
  const [ox, oy] = toUtm(place.lon, place.lat);
  const feats = await wfs('ave:Flurstueck', place.lat, place.lon, 45, signal);
  const parcels: Parcel[] = feats.map((f) => ({
    id: txt(f, 'idflurst') || txt(f, 'oid'),
    ring: ringOf(f, ox, oy),
    area: Number(txt(f, 'flaeche')) || 0,
    label: txt(f, 'lagebeztxt'),
    gemarkung: txt(f, 'gemarkung'),
    flur: String(Number(txt(f, 'flur')) || ''),
    nr: [txt(f, 'flstnrzae'), txt(f, 'flstnrnen')].filter(Boolean).join('/'),
    use: txt(f, 'tntxt'),
  })).filter((p) => p.ring.length >= 3);
  const origin: Pt = [0, 0];
  let main = parcels.find((p) => inside(origin, p.ring));
  if (!main && parcels.length) main = parcels.slice().sort((a, b) => distPtPoly(origin, a.ring) - distPtPoly(origin, b.ring))[0];
  return { parcels, main, utmOrigin: [ox, oy] as Pt };
}

export async function loadBuildings(place: Place, signal?: AbortSignal): Promise<Pt[][]> {
  const [ox, oy] = toUtm(place.lon, place.lat);
  const feats = await wfs('ave:GebaeudeBauwerk', place.lat, place.lon, 60, signal);
  return feats.map((f) => ringOf(f, ox, oy)).filter((r) => r.length >= 3);
}

/* ---------- Geometrie ---------- */
export const area = (r: Pt[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export const centroid = (r: Pt[]): Pt => {
  let a = 0, cx = 0, cy = 0;
  r.forEach((p, i) => { const q = r[(i + 1) % r.length]; const c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; });
  if (Math.abs(a) < 1e-9) return r[0];
  return [cx / (3 * a), cy / (3 * a)];
};
export function inside(p: Pt, r: Pt[]) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function distPtSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export const distPtPoly = (p: Pt, r: Pt[]) => (inside(p, r) ? 0 : Math.min(...r.map((a, i) => distPtSeg(p, a, r[(i + 1) % r.length]))));
const edgeDist = (p: Pt, r: Pt[]) => Math.min(...r.map((a, i) => distPtSeg(p, a, r[(i + 1) % r.length])));
/** Kleinster Abstand zwischen zwei Polygonen (Ränder), plus wo er auftritt. */
export function minGap(a: Pt[], b: Pt[]) {
  let best = Infinity, at: [Pt, Pt] = [a[0], b[0]];
  const probe = (p: Pt, r: Pt[]) => {
    r.forEach((s, i) => {
      const e = r[(i + 1) % r.length];
      const dx = e[0] - s[0], dy = e[1] - s[1];
      const t = Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / (dx * dx + dy * dy || 1)));
      const q: Pt = [s[0] + t * dx, s[1] + t * dy];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < best) { best = d; at = [p, q]; }
    });
  };
  a.forEach((p) => probe(p, b));
  b.forEach((p) => { const before = best; probe(p, a); if (best < before) at = [at[1], at[0]]; });
  return { d: best, at };
}
function segX(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
export function overlaps(a: Pt[], b: Pt[]) {
  if (a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (segX(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  return false;
}
export function rect(cx: number, cy: number, w: number, d: number, deg: number): Pt[] {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as Pt[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
/** Abstandsfläche als abgerundetes Rechteck um das Haus. */
export function zone(cx: number, cy: number, w: number, d: number, deg: number, off: number): Pt[] {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const pts: Pt[] = [];
  const corners: [number, number, number][] = [[w / 2, -d / 2, -90], [w / 2, d / 2, 0], [-w / 2, d / 2, 90], [-w / 2, -d / 2, 180]];
  corners.forEach(([x, y, a0]) => {
    for (let k = 0; k <= 6; k++) {
      const a = ((a0 + k * 15) * Math.PI) / 180;
      const px = x + off * Math.cos(a), py = y + off * Math.sin(a);
      pts.push([cx + px * c - py * s, cy + px * s + py * c]);
    }
  });
  return pts;
}
/** Richtung der längsten Grundstücksseite (Grad), zum Ausrichten. */
export function longestEdgeAngle(r: Pt[]) {
  let best = 0, ang = 0;
  r.forEach((a, i) => { const b = r[(i + 1) % r.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best) { best = L; ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; } });
  return ((ang % 180) + 180) % 180;
}
export const edgeLengths = (r: Pt[]) => r.map((a, i) => { const b = r[(i + 1) % r.length]; return { a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
export { edgeDist };
