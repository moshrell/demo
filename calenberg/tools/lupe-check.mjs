// Лупа на собранном сайте: CHROME=<chrome> node tools/lupe-check.mjs <ширина>x<высота> <папка> [x y]  (x, y: доля кадра, по умолчанию ратуша на macro_balance)
import { chromium } from 'playwright-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [size = '390x844', out = 'lupe-check', fx = '0.845', fy = '0.4'] = process.argv.slice(2); const [vw, vh] = size.split('x').map(Number);
fs.mkdirSync(out, { recursive: true }); const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mobile = vw < 700; const ctx = await b.newContext({ viewport: { width: vw, height: vh }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1 });
const p = await ctx.newPage(); const logs = []; p.on('pageerror', (e) => logs.push(e.message)); p.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
await p.goto(`http://127.0.0.1:${srv.address().port}/`); await p.waitForTimeout(1500);
const n = await p.locator('[data-lupe]').count(); const res = { size, lupen: n, shots: [] };
for (let i = 0; i < n; i++) {
  const box = p.locator('[data-lupe]').nth(i); await box.evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(900);
  const img = await box.locator('img').boundingBox(); const bb = await box.boundingBox();
  const x = i === 0 ? img.x + img.width * +fx : bb.x + bb.width * 0.5, y = i === 0 ? img.y + img.height * +fy : bb.y + bb.height * 0.5;
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.waitForTimeout(1800);
  const g = await box.locator('.lupe__glas').evaluate((e) => ({ bg: getComputedStyle(e).backgroundImage.replace(/^.*\/img\//, ''), size: getComputedStyle(e).backgroundSize, op: getComputedStyle(e).opacity }));
  const f = path.join(out, `lupe_${size}_${i}.png`); await p.screenshot({ path: f }); res.shots.push({ i, ...g }); await p.mouse.up();
}
res.logs = logs; console.log(JSON.stringify(res, null, 1)); await b.close(); srv.close();
