// Первый экран на медленной сети: node tools/net-check.mjs (после DEMO_BASE=/ npx astro build). Телефон 390px, CPU x4.
import { chromium } from 'playwright-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('dist'); const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.jpg':'image/jpeg' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const [name, down, lat] of [['slow4g', 1.6, 150], ['4g', 9, 60]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  var t0 = Date.now(); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: lat, downloadThroughput: down * 125000, uploadThroughput: 750 * 125, connectionType: 'cellular4g' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0; const reqs = {}; const done = []; cdp.on('Network.requestWillBeSent', (e) => { reqs[e.requestId] = e.request.url.replace(/^http:\/\/[^/]+/, ''); }); cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; done.push([Math.round(Date.now() - t0), reqs[e.requestId], Math.round(e.encodedDataLength / 1024)]); });
  await p.addInitScript(() => { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); });
  var t0 = Date.now(); await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 }); const tl = Date.now() - t0;
  await p.waitForTimeout(4500);
  await p.waitForTimeout(1500); const lcp = await p.evaluate(() => window.__lcp);
  const b1 = bytes; await p.waitForTimeout(8000);
  console.log(done.slice(0, 14).map((d) => d.join(' ')).join('\n')); console.log(name, 'DOM', tl, 'ms; LCP', Math.round(lcp), 'ms; bytes at load+1.5s', (b1/1e6).toFixed(2), 'MB; after 10 s', (bytes/1e6).toFixed(2), 'MB');
  await ctx.close();
}
await b.close(); srv.close();
