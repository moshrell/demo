// npm run privat: собирает сайт под закрытый адрес (без ссылок с сайта, noindex)
// и кладёт его в ..\\kravets-site\\public\\p\\<token>. Дальше commit и push в kravets-site.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const token = readFileSync('.privat-token', 'utf8').trim();
const base = `/p/${token}/`;
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, GL_BASE: base } });
run('npx astro build');
run('node scripts/ki-hinweis.mjs');
run('node scripts/htaccess.mjs');
const site = resolve('..', 'kravets-site', 'public');
if (!existsSync(site)) { console.error('[privat] не найдена папка kravets-site рядом с проектом'); process.exit(1); }
const target = resolve(site, 'p', token);
rmSync(target, { recursive: true, force: true });
cpSync('dist', target, { recursive: true });
console.log('[privat] готово →', target);
console.log('[privat] адрес после push: https://kravets-webdesign.de' + base);
