// npm run publish: собирает демо и кладёт его в портфолио основного сайта
// (..\kravets-site\public\vorschau\<категория>\<slug>). Дальше — коммит и push в kravets-site.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Облако: KRAVETS_SITE=/путь/к/kravets-site (на ПК папка лежит рядом: D:\Webdesign\kravets-site)
const site = process.env.KRAVETS_SITE || resolve('..', 'kravets-site');
const target = resolve(site, 'public', 'vorschau', 'auto', 'glanzleistung');
if (!existsSync(resolve(site, 'public'))) {
  console.error('[publish] не найдена папка kravets-site рядом с проектом');
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync('dist', target, { recursive: true });
console.log('[publish] готово →', target);
