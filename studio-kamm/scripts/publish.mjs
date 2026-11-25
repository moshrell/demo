// npm run publish: собирает демо и кладёт его в портфолио основного сайта
// (D:\Webdesign\kravets-site\public\vorschau\friseur\studio-kamm). Дальше — коммит и push в kravets-site.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('..', 'kravets-site', 'public', 'vorschau', 'friseur', 'studio-kamm');
if (!existsSync(resolve(target, '..'))) {
  console.error('[publish] не найдена папка', resolve(target, '..'));
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync('dist', target, { recursive: true });
console.log('[publish] готово →', target);
