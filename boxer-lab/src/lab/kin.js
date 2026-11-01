// Pure math for a flat-six (boxer) engine. No three.js in here.
// Units: 1 unit = 100 mm.  ASSUMED design numbers (not measured from a real engine):
//   bore 97 mm, stroke 81.5 mm, rod c/c 130 mm, cylinder pitch 152 mm.
// Firing order 1-6-2-4-3-5 (right bank 1-2-3, left bank 4-5-6), 120 deg apart.
export const E = {
  bore: 0.97, stroke: 0.815, rod: 1.30, pitch: 1.52, pairGap: 0.50,
  pinW: 0.34, pinR: 0.26, mainR: 0.30, mainW: 0.38,
};
E.r = E.stroke / 2;
export const FIRE = {1: 0, 6: 120, 2: 240, 4: 360, 3: 480, 5: 600}; // deg of crank, 720 deg cycle
const D2R = Math.PI / 180;

export const CYL = [1, 2, 3, 4, 5, 6].map((n) => {
  const right = n <= 3;
  const pair = (n - 1) % 3;                       // 0..2, front to back; (1,4) (2,5) (3,6) mirror each other
  const zc = (pair - 1) * E.pitch;
  const tdc = FIRE[n] % 360;
  return {
    n, right, pair, zc,
    z: zc + (right ? -1 : 1) * E.pairGap / 2,
    s: right ? 1 : -1,                            // +1 = cylinder points to +x
    a0: (right ? -tdc : 180 - tdc) * D2R,         // pin angle at crank angle 0
  };
});

export const DISPLACEMENT_CC = 6 * Math.PI / 4 * (E.bore * 10) ** 2 * (E.stroke * 10); // cm3

// th = crank angle in radians.
export function pose(c, th) {
  const a = c.a0 + th;
  const px = E.r * Math.cos(a), py = E.r * Math.sin(a);
  const wx = px + c.s * Math.sqrt(E.rod * E.rod - py * py);   // wrist pin on the cylinder axis (y = 0)
  const rodAng = Math.atan2(-py, wx - px);
  const deg = th / D2R;
  const phase = (((deg - FIRE[c.n]) % 720) + 720) % 720;       // 0 = firing TDC
  return {px, py, wx, rodAng, phase, stroke: Math.floor(phase / 180)}; // 0 power 1 exhaust 2 intake 3 compression
}
