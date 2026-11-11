// Grundstück per Adresse: Photon (OSM) → LGLN ALKIS vereinfacht (WFS, GML 3.2, EPSG:25832).
// Wiederverwendbar (siehe _briefs/_module/grundstueck-adresse.txt). Keine Daten werden gespeichert.
import proj4 from 'proj4';

import type { Pt } from './geom';
import { inside } from './geom';
export type { Pt } from './geom';
export * from './geom';
export interface Parcel { id: string; ring: Pt[]; area: number; label: string; gemarkung: string; flur: string; nr: string; use: string; }
export interface Place { label: string; lat: number; lon: number; }

proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toUtm = (lon: number, lat: number) => proj4('EPSG:4326', 'EPSG:25832', [lon, lat]) as [number, number];

const WFS = 'https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wfs_einfach';
const PHOTON = 'https://photon.komoot.io/api/';
const NDS_BBOX = '6.6,51.29,11.6,53.9';

const NOMI = 'https://nominatim.openstreetmap.org/search';
const dedupe = (l: Place[]) => { const seen = new Set<string>(); return l.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true))); };
const mkLabel = (street: string, zip?: string, city?: string) => [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

async function photon(q: string, signal: AbortSignal): Promise<Place[]> {
  const u = `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lang=de&bbox=${NDS_BBOX}`;
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error('geocode');
  const j = await r.json();
  return dedupe((j.features || [])
    .filter((f: any) => f.properties?.state === 'Niedersachsen')
    .map((f: any) => {
      const p = f.properties;
      return { label: mkLabel([p.street || p.name, p.housenumber].filter(Boolean).join(' '), p.postcode, p.city || p.district), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    }));
}

// Ausweichdienst, falls Photon (öffentlicher Server) nicht antwortet. Nur bei Knopfdruck, ein Aufruf pro Suche.
async function nominatim(q: string, signal: AbortSignal): Promise<Place[]> {
  const u = `${NOMI}?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=6&countrycodes=de&accept-language=de&viewbox=6.6,53.9,11.6,51.29&bounded=1`;
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error('geocode2');
  const j = await r.json();
  return dedupe((j || [])
    .filter((x: any) => x.address?.state === 'Niedersachsen')
    .map((x: any) => {
      const a = x.address;
      return { label: mkLabel([a.road || a.pedestrian || x.name, a.house_number].filter(Boolean).join(' '), a.postcode, a.city || a.town || a.village || a.municipality), lon: Number(x.lon), lat: Number(x.lat) };
    }));
}

/** Adresse → Orte. Photon zuerst (6 s), danach Nominatim. Abbruch durch den Nutzer wird weitergereicht. */
export async function geocode(q: string, signal?: AbortSignal): Promise<Place[]> {
  const run = async (fn: (q: string, s: AbortSignal) => Promise<Place[]>, ms: number) => {
    const c = new AbortController();
    const onAbort = () => c.abort();
    signal?.addEventListener('abort', onAbort);
    const t = setTimeout(() => c.abort(), ms);
    try { return await fn(q, c.signal); } finally { clearTimeout(t); signal?.removeEventListener('abort', onAbort); }
  };
  try {
    return await run(photon, 6000);
  } catch (e) {
    if (signal?.aborted) throw e;
    return await run(nominatim, 8000);
  }
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

