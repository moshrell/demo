// Astro кладёт в dist/_astro ещё и исходные фото (по 2–5 МБ). Они нигде не используются
// (в HTML только оптимизированные webp), поэтому после сборки убираем всё неиспользуемое.
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const list = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(join(d, e.name)) : [join(d, e.name)]));
const all = list(DIST);
const text = all.filter((f) => /\.(html|css|js|mjs)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
let removed = 0, bytes = 0;
for (const f of all) {
  if (!/\.(jpe?g|png|avif)$/i.test(f)) continue;
  if (!f.includes('_astro')) continue;
  const name = f.split(/[\\/]/).pop();
  if (!text.includes(name)) {
    bytes += statSync(f).size;
    rmSync(f);
    removed++;
  }
}
console.log(`[prune] ${removed} неиспользуемых оригиналов удалено (${(bytes / 1048576).toFixed(1)} МБ)`);
