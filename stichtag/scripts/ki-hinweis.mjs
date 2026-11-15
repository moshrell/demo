// v3. Верхней плашки про демо больше нет. После astro build (и для уже опубликованных демо:
// node scripts/ki-hinweis.mjs <папка> [--dry]) скрипт:
//  1) вырезает старую плашку v1/v2 (+ ki-hinweis.css/.js);
//  2) в impressum/index.html гарантирует раскрытие: «Betrieb und Personen erfunden» и «Bilder teils KI-erzeugt»;
//  3) на главной гарантирует пометку, что это демо (если на странице её нет; добавляется в футер).
// Повторный запуск безопасен. Имя файла прежнее, чтобы не менять цепочки сборки.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const DIST = args.find((a) => !a.startsWith('--')) ?? 'dist';
const DEMO = /erfunden|fiktiv|Demo-Website|Demo-Seite|Beispielseite/i;
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const list = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(join(d, e.name)) : [join(d, e.name)]));
const log = [];

function strip(h) {
  return h
    .replace(/<div class="ki-hinweis"[\s\S]*?<\/div>\s*<script src="[^"]*ki-hinweis\.js"><\/script>/g, '')
    .replace(/<p class="ki-hinweis">[^<]*<\/p>/g, '')
    .replace(/<link rel="stylesheet" href="[^"]*ki-hinweis\.css">/g, '');
}

try {
  for (const f of list(DIST).filter((x) => x.endsWith('.html'))) {
    const orig = readFileSync(f, 'utf8');
    let h = strip(orig);
    const rel = f.slice(DIST.length + 1).replace(/\\/g, '/');
    if (rel === 'impressum/index.html') {
      const t = text(h);
      const add = [];
      if (!DEMO.test(t)) add.push('Beispielseite von Kravets Webdesign: Betrieb und Personen sind erfunden.');
      if (!/KI-/.test(t)) add.push('Die Bilder dieser Beispielseite sind teils KI-erzeugt.');
      if (add.length) {
        const p = `<p>${add.join(' ')}</p>`;
        h = h.includes('</main>') ? h.replace('</main>', `${p}</main>`) : h.replace('</body>', `${p}</body>`);
        log.push(`${rel}: + ${add.length} Satz/Sätze`);
      }
    } else if (rel === 'index.html') {
      const i = h.lastIndexOf('<footer');
      const j = h.indexOf('</footer>', i);
      if (i < 0 || j < 0) log.push(`${rel}: KEIN FOOTER, manuell prüfen`);
      else if (!DEMO.test(text(h))) {
        h = h.slice(0, j) + '<p>Demo-Seite: Betrieb und Personen sind erfunden.</p>' + h.slice(j);
        log.push(`${rel}: + Demo-Zeile im Footer`);
      }
    }
    if (h !== orig && !DRY) writeFileSync(f, h);
    if (h !== orig && !log.some((l) => l.startsWith(rel))) log.push(`${rel}: Plakette entfernt`);
  }
  for (const n of ['ki-hinweis.css', 'ki-hinweis.js']) if (!DRY && existsSync(join(DIST, n))) rmSync(join(DIST, n));
  console.log(`[ki-hinweis v3]${DRY ? ' DRY' : ''}\n  ${log.join('\n  ') || 'nichts zu tun'}`);
} catch (e) {
  console.error('[ki-hinweis]', e);
  process.exit(1);
}
