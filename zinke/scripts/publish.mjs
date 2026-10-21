// npm run publish: собирает демо и кладёт его в портфолио основного сайта
// (..\kravets-site\public\vorschau\<категория>\<slug>). Дальше — коммит и push в kravets-site.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('..', 'kravets-site', 'public', 'vorschau', 'handwerk', 'zinke');
if (!existsSync(resolve('..', 'kravets-site', 'public'))) {
  console.error('[publish] не найдена папка kravets-site рядом с проектом');
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync('dist', target, { recursive: true });
console.log('[publish] готово →', target);
