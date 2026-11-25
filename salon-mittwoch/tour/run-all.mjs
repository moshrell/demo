// Снимает ролики для карточек по очереди и кладёт готовые в kravets-site\public\works\<slug>.mp4
// Все:            node tour\run-all.mjs
// Выборочно:      node tour\run-all.mjs glanzleistung zinke
// Показать список: node tour\run-all.mjs --list
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = 'D:\\Webdesign\\kravets-site\\public\\vorschau\\';
const WORKS = 'D:\\Webdesign\\kravets-site\\public\\works\\';
const live = (s) => ({url: `https://moshrell.github.io/demo/${s}/`});
const local = (cat, s) => ({dist: V + `${cat}\\${s}`, base: `/vorschau/${cat}/${s}/`});
// slug (имя в works.ts) → сценарий и источник
const SITES = {
  'glanzleistung':       {tour: 'glanz-card',        ...local('auto', 'glanzleistung')},
  'gegenlauf':           {tour: 'gegenlauf-card',    ...live('gegenlauf')},
  'zuendfolge':          {tour: 'zuendfolge-card',   ...local('auto', 'zuendfolge')},
  'sechsgang':           {tour: 'sechsgang-card',    ...local('auto', 'sechsgang')},
  'schulterblick':       {tour: 'schulterblick-card',...local('auto', 'schulterblick')},
  'zinke':               {tour: 'zinke-card',        ...local('handwerk', 'zinke')},
  'stromkreis':          {tour: 'stromkreis-card',   ...local('handwerk', 'stromkreis')},
  'kupferlauf':          {tour: 'kupferlauf-card',   ...live('kupferlauf')},
  'aufschluss':          {tour: 'aufschluss-card',   ...live('aufschluss')},
  'gartenjahr':          {tour: 'gartenjahr-card',   ...live('gartenjahr')},
  'studio-kamm':         {tour: 'kamm-card',         ...local('friseur', 'studio-kamm')},
  'salon-nelke':         {tour: 'salon-nelke-card',  ...local('friseur', 'salon-nelke')},
  'nuance':              {tour: 'nuance-card',       ...local('friseur', 'nuance')},
  'artisanal-bakery':    {tour: 'artisanal-card',    ...local('cafe', 'artisanal-bakery')},
  'backstube-morgenrot': {tour: 'morgenrot-card',    ...local('cafe', 'backstube-morgenrot')},
  'cafe-ferreira':       {tour: 'cafe-ferreira-card',...local('cafe', 'cafe-ferreira')},
  'architekt':           {tour: 'architekt-card',    ...local('dienstleistung', 'architekt')},
  'rehfeld-winkler':     {tour: 'rehfeld-winkler-card', ...live('rehfeld-winkler')},
  'wohlauf':             {tour: 'wohlauf-card',      ...live('wohlauf')},
  'richtfest':           {tour: 'richtfest-card',    ...live('richtfest')},
  'fernpunkt':           {tour: 'fernpunkt-card',    ...live('fernpunkt')},
  'hannover-rathaus':    {tour: 'hannover-karte-card', url: 'https://kravets-webdesign.de/hannover-karte/'},
};
const args = process.argv.slice(2);
if (args.includes('--list')) { console.log(Object.keys(SITES).join('\n')); process.exit(0); }
// По умолчанию: что осталось снять + пересъёмка по замечаниям (остальное уже снято). --all = вообще всё.
const OPEN = ['glanzleistung', 'hannover-rathaus', 'wohlauf'];
const names = args.filter((a) => !a.startsWith('--'));
const todo = names.length ? names : args.includes('--all') ? Object.keys(SITES) : OPEN;
const report = [];
for (const slug of todo) {
  const s = SITES[slug];
  if (!s) { console.log(`? неизвестно: ${slug}`); continue; }
  const out = path.join(root, 'preview', slug);
  console.log(`\n===== ${slug} =====`);
  const a = ['tour\\record.mjs', `${s.tour}.tour.mjs`, `--out=${out}`];
  if (s.url) a.push(`--url=${s.url}`); else a.push('--no-build', `--dist=${s.dist}`, `--base=${s.base}`);
  const r = spawnSync('node', a, {cwd: root, stdio: 'inherit', env: {...process.env, MODE: 'card'}});
  const f = path.join(out, `${s.tour}.mp4`);
  if (r.status === 0 && fs.existsSync(f) && fs.statSync(f).size > 50000) {
    fs.copyFileSync(f, path.join(WORKS, `${slug}.mp4`));
    report.push(`OK   ${slug}  ${(fs.statSync(f).size / 1048576).toFixed(2)} МБ`);
  } else report.push(`FAIL ${slug}`);
}
console.log('\n===== ИТОГ =====\n' + report.join('\n'));
