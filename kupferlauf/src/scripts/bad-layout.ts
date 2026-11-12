// Bad-Baukasten: Anordnung der Teile im Raum (reine Mathematik, ohne three.js, in Node testbar).
// Koordinaten in Metern. Rückwand: z = 0 (Teile stehen von x = 0 nach rechts), linke Wand: x = 0 (Teile stehen von z = Ende der Nassfläche nach vorn).

export type Wall = 'back' | 'left';
export interface Slot {
  zone: 'wanne' | 'waschen' | 'wc' | 'spiegel';
  kind: string;      // wanne | dusche | becken | tisch | tisch2 | stand | wand | spiegel
  wall: Wall;
  along: number;     // Mitte entlang der Wand
  w: number;         // Breite entlang der Wand
  d: number;         // Tiefe von der Wand weg
}
export interface Room { w: number; d: number }
export interface Choice { wanne: string; waschen: string; wc: string }

// Maße der Teile nach Skalierung (Kenney-Modelle × Faktor, siehe bad3d.ts)
export const DIM = {
  wanne: { w: 1.73, d: 0.81 },
  dusche: { w: 1.04, d: 1.02 },
  becken: { w: 0.52, d: 0.46 },
  tisch: { w: 0.69, d: 0.75 },
  doppel: { w: 1.3, d: 0.75 },
  stand: { w: 0.69, d: 0.62 },
  wand: { w: 0.69, d: 0.78 }, // inkl. Vorwand
};

const GAP = 0.12;

export function layout(room: Room, c: Choice): Slot[] {
  const out: Slot[] = [];

  // Nassfläche an der Rückwand, von links
  const wet: Array<'wanne' | 'dusche'> = c.wanne === 'beides' ? ['wanne', 'dusche'] : [c.wanne === 'dusche' ? 'dusche' : 'wanne'];
  let x = 0;
  let wetD = 0;
  for (const k of wet) {
    const m = DIM[k];
    out.push({ zone: 'wanne', kind: k, wall: 'back', along: x + m.w / 2, w: m.w, d: m.d });
    x += m.w + 0.04;
    wetD = Math.max(wetD, m.d);
  }
  x -= 0.04;

  // WC immer an der linken Wand, direkt hinter der Nassfläche
  let z = wetD + GAP;
  const wc = DIM[c.wc === 'wand' ? 'wand' : 'stand'];
  out.push({ zone: 'wc', kind: c.wc === 'wand' ? 'wand' : 'stand', wall: 'left', along: z + wc.w / 2, w: wc.w, d: wc.d });
  z += wc.w + GAP;

  // Waschplatz: rechts neben der Nassfläche an der Rückwand, sonst an der linken Wand
  const wk = c.waschen === 'doppel' ? 'doppel' : c.waschen === 'tisch' ? 'tisch' : 'becken';
  const ws = DIM[wk];
  const kind = wk === 'doppel' ? 'tisch2' : wk;
  if (x + GAP + ws.w <= room.w - 0.04) {
    const a = x + GAP + ws.w / 2;
    out.push({ zone: 'waschen', kind, wall: 'back', along: a, w: ws.w, d: ws.d });
    out.push({ zone: 'spiegel', kind: 'spiegel', wall: 'back', along: a, w: wk === 'doppel' ? 1.1 : 0.6, d: 0.1 });
  } else {
    const a = z + ws.w / 2;
    out.push({ zone: 'waschen', kind, wall: 'left', along: a, w: ws.w, d: ws.d });
    out.push({ zone: 'spiegel', kind: 'spiegel', wall: 'left', along: a, w: wk === 'doppel' ? 1.1 : 0.6, d: 0.1 });
  }
  return out;
}

// Grundfläche eines Teils im Raum (x0, z0, x1, z1)
export function footprint(s: Slot): [number, number, number, number] {
  return s.wall === 'back'
    ? [s.along - s.w / 2, 0, s.along + s.w / 2, s.d]
    : [0, s.along - s.w / 2, s.d, s.along + s.w / 2];
}
