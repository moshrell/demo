// Astro-Integration: перед сборкой/dev делает WebP-версии фото из public/img/*.jpg в public/img/w/ (480/960/1440 px).
// Работает и в GitHub Actions (там вызывается npx astro build напрямую). Новые фото Степана подхватываются сами.
import fs from 'node:fs';
import path from 'node:path';
export const WIDTHS = [480, 960, 1440];
export function bilder() {
  return {
    name: 'zf-bilder',
    hooks: {
      'astro:config:setup': async () => {
        const dir = path.resolve('public/img'), out = path.join(dir, 'w');
        if (!fs.existsSync(dir)) return;
        const sharp = (await import('sharp')).default;
        fs.mkdirSync(out, { recursive: true });
        for (const f of fs.readdirSync(dir).filter((x) => /\.jpe?g$/i.test(x))) {
          const src = path.join(dir, f), base = f.replace(/\.jpe?g$/i, ''), mt = fs.statSync(src).mtimeMs;
          const meta = await sharp(src).metadata();
          for (const [i, w] of WIDTHS.entries()) {
            // первая ширина больше исходника = исходник целиком (иначе у 896-px кадров был бы только 480w и на телефонах мыло)
            if (i > 0 && WIDTHS[i - 1] >= (meta.width || 0)) continue;
            const dst = path.join(out, `${base}-${w}.webp`);
            if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= mt) continue;
            await sharp(src).resize({ width: Math.min(w, meta.width || w) }).webp({ quality: 78 }).toFile(dst);
          }
        }
      },
    },
  };
}
