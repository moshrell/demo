import { buildTrack, makeCones } from '../../src/scripts/quersteher/track.js';
import { makeCar, step } from '../../src/scripts/quersteher/sim.js';
import { racingLine, makeBot } from './ai.mjs';
const tr = buildTrack(), rl = racingLine(tr);
const car = makeCar(tr, makeCones(tr)); const bot = makeBot(tr, rl, {});
let last = -1; const rows = [];
while (!car.finished && car.t < 60) { step(car, tr, bot(car)); const k = Math.floor(car.idx / 20); if (k !== last) { last = k; rows.push(`${car.idx}:${car.speed.toFixed(0)}/${rl.v[car.idx].toFixed(0)} lat${car.lat.toFixed(0)} slip${car.slip.toFixed(0)}`); } }
console.log(rows.join('\n'), '\nT', car.finishT, 'hits', car.hits);
