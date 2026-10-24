import { writeFileSync } from 'node:fs';
import { buildTrack, makeCones } from '../../src/scripts/quersteher/track.js';
import { makeCar, step } from '../../src/scripts/quersteher/sim.js';
import { racingLine, makeBot } from './ai.mjs';
const tr = buildTrack(), rl = racingLine(tr);
const car = makeCar(tr, makeCones(tr)); const bot = makeBot(tr, rl, {});
const d = []; let n = 0;
while (!car.finished && car.t < 90) { step(car, tr, bot(car)); if (n++ % 6 === 0) d.push(+car.x.toFixed(1), +car.y.toFixed(1), +car.th.toFixed(3), Math.round(car.prog)); }
d.push(+car.x.toFixed(1), +car.y.toFixed(1), +car.th.toFixed(3), Math.round(tr.len));
const out = `// Geister-Auto: aufgezeichnete Ideal-Runde (Bot), 20 Hz, je Eintrag x, y, Richtung, Strecke. Erzeugt von tools/makeghost.mjs.\nexport const GHOST = { dt: 0.05, time: ${car.finishT.toFixed(3)}, len: ${Math.round(tr.len)}, d: [${d.join(',')}] };\n`;
writeFileSync('src/scripts/quersteher/ghost.js', out);
console.log('ghost', car.finishT.toFixed(2), 'samples', d.length / 4, 'bytes', out.length);
