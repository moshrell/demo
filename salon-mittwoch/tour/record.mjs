// Запуск:  node tour/record.mjs [--no-build]
// Результат: папка preview\ (MP4 9:16 и 16:9, постер, контактный лист).
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {serve, record, compose} from './engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tourName = process.argv.find((a) => a.endsWith('.tour.mjs')) || 'mittwoch.tour.mjs';
const name = tourName.replace('.tour.mjs', '');
const {default: scenario, meta} = await import(pathToFileURL(path.join(root, 'tour', tourName)).href);
// Любое готовое демо можно снимать без исходников: --dist=D:\\Webdesign\\kravets-site\\public\\vorschau\\auto\\glanzleistung --base=/vorschau/auto/glanzleistung/
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const cfgPath = path.join(root, 'astro.config.mjs');
const cfg = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : '';
const base = arg('base') || (cfg.match(/base:\s*'([^']+)'/) || [, '/'])[1];
const dist = arg('dist') || path.join(root, 'dist');

const URL_ARG = arg('url');
if (!URL_ARG && !process.argv.includes('--no-build') || !fs.existsSync(path.join(dist, 'index.html'))) {
  console.log('Собираю сайт (astro build)…');
  const r = spawnSync('npx', ['astro', 'build'], {cwd: root, shell: true, stdio: 'inherit'});
  if (r.status !== 0) { console.log('Сборка не удалась'); process.exit(1); }
}
const {srv, port} = URL_ARG ? {srv: {close() {}}, port: 0} : await serve(dist, base);
const outDir = arg('out') || path.join(root, 'preview');
try {
  console.log('Снимаю…');
  const raw = await record({url: URL_ARG || `http://127.0.0.1:${port}${base}`, outDir, name, scenario});
  if (process.env.MODE === 'card') { console.log('Ролик для карточки готов:', raw); } else {
  console.log('Собираю рамку телефона и форматы…');
  await compose({raw, outDir, name, meta});
  }
  console.log('Готово:', outDir);
} finally { srv.close(); }
