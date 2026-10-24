import { buildTrack } from '../../src/scripts/quersteher/track.js';
import { racingLine } from './ai.mjs';
import { lap } from './run.mjs';
const tr = buildTrack(), rl = racingLine(tr);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ideal = lap(tr, rl, {});
console.log('IDEAL', ideal.t.toFixed(2), 'hits', ideal.hits);
const cfgs = {
  good: { period: 0.12, noise: 0.10, dead: 0.07, look0: 45, lookK: 0.3, brakeMargin: 18, brakeLook: 0.55, missBrake: 0.05 },
  mid: { period: 0.18, noise: 0.16, dead: 0.10, look0: 50, lookK: 0.28, brakeMargin: 28, brakeLook: 0.55, missBrake: 0.12 },
  weak: { period: 0.26, noise: 0.24, dead: 0.14, look0: 55, lookK: 0.25, brakeMargin: 40, brakeLook: 0.6, missBrake: 0.25 },
};
for (const [name, c] of Object.entries(cfgs)) {
  const ts = [];
  for (let i = 0; i < 120; i++) ts.push(lap(tr, rl, { ...c, rng: rng(i * 7919 + 13) }).t);
  ts.sort((a, b) => a - b);
  const fin = ts.filter(isFinite);
  const q = (p) => fin[Math.floor(fin.length * p)]?.toFixed(1);
  console.log(name.padEnd(5), 'fin', fin.length, 'p10', q(0.1), 'p25', q(0.25), 'med', q(0.5), 'p75', q(0.75), 'p90', q(0.9));
}
