// После astro build: своя .htaccess для демо в dist/ — политика безопасности (CSP) под 3D-сцену.
// Отличия от основного сайта: 'wasm-unsafe-eval' (распаковка модели кресла, meshopt)
// и blob: (текстуры модели three.js грузит через blob-адреса). Остальное — как на kravets-webdesign.de.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const hash = (t) => `'sha256-${createHash('sha256').update(t, 'utf8').digest('base64')}'`;
const decode = (t) => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const list = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(join(d, e.name)) : [join(d, e.name)]));

try {
  const scripts = new Set(), styles = new Set();
  const files = list(DIST).filter((f) => f.endsWith('.html'));
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/i.test(attrs) || /application\/ld\+json/i.test(attrs) || body === '') continue;
      scripts.add(hash(body));
    }
    for (const [, body] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) styles.add(hash(body));
    for (const [, v] of html.matchAll(/\sstyle="([^"]*)"/gi)) styles.add(hash(decode(v)));
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${[...scripts].sort().join(' ')}`.trim(),
    `style-src 'self' 'unsafe-hashes' ${[...styles].sort().join(' ')}`.trim(),
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' blob: data:",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  writeFileSync(join(DIST, '.htaccess'), `# Демо Salon Mittwoch: своя политика безопасности (перекрывает политику основного сайта)
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "${csp}"
  Header always set X-Robots-Tag "noindex, nofollow"
  <If "%{REQUEST_URI} =~ m#/_astro/#">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </If>
  <FilesMatch "\\.(glb|hdr|webp)$">
    Header set Cache-Control "public, max-age=604800"
  </FilesMatch>
</IfModule>
<IfModule mod_mime.c>
  AddType model/gltf-binary .glb
  AddType image/vnd.radiance .hdr
</IfModule>
`);
  console.log(`[htaccess] ${files.length} страниц: ${scripts.size} скриптов, ${styles.size} стилей → dist/.htaccess`);
} catch (e) {
  console.error('[htaccess]', e);
  process.exit(1);
}
