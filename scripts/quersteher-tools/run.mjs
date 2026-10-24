import { buildTrack, makeCones } from '../../src/scripts/quersteher/track.js';
import { makeCar, step, DT } from '../../src/scripts/quersteher/sim.js';
import { racingLine, makeBot } from './ai.mjs';
export function lap(tr, rl, botOpt, maxT = 120, record = false) {
  const cones = makeCones(tr);
  const car = makeCar(tr, cones);
  const bot = makeBot(tr, rl, botOpt);
  const rec = [];
  let n = 0;
  while (!car.finished && car.t < maxT) {
    const inp = bot(car);
    step(car, tr, inp);
    if (record && n++ % 6 === 0) rec.push([+car.x.toFixed(1), +car.y.toFixed(1), +car.th.toFixed(3)]);
  }
  return { t: car.finished ? car.finishT : Infinity, hits: car.hits, resp: car.respawned || 0, rec, car };
}
if (process.argv[1].endsWith('run.mjs')) {
  const tr = buildTrack(); const rl = racingLine(tr);
  let vmaxL = 0;
  const r = lap(tr, rl, {});
  console.log('ideal', r.t.toFixed(2), 'hits', r.hits, 'resp', r.resp);
}
