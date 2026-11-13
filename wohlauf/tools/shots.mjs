// Стоп-кадры фигуры и сценарий главной: выбор зон, поворот, форма. Числа в stdout, кадры в <outDir>.
// DEMO_BASE=/ npx astro build && CHROME=... node tools/shots.mjs <outDir> [poster]
import {chromium} from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const out = process.argv[2] || '/tmp/shots'; fs.mkdirSync(out, {recursive: true});
const root = path.resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream'};
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); }).listen(0);
const U = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({executablePath: process.env.CHROME, headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const res = {}; const logs = [];
const mk = async (w, h, touch) => { const c = await browser.newContext({viewport: {width: w, height: h}, hasTouch: touch, isMobile: touch, timezoneId: 'Europe/Berlin', deviceScaleFactor: touch ? 2 : 1, reducedMotion: 'reduce'}); const p = await c.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GPU stall|WebGL.*software/i.test(m.text())) logs.push(m.text()); }); p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message)); return p; };
const ready = (p) => p.waitForSelector('.figure.is-ready', {timeout: 20000});

if (process.argv[3] === 'poster') {
  const p = await mk(480, 1100, false); await p.goto(U + '/'); await ready(p);
  await p.evaluate(() => { const f = document.querySelector('[data-figure]'); document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:transparent;padding:0'; document.documentElement.style.background = 'transparent'; f.style.cssText = 'position:fixed;inset:0;width:480px;height:1100px'; document.body.append(f); });
  await p.waitForTimeout(400); await p.evaluate(() => window.__body.still(0)); await p.waitForTimeout(200);
  await p.screenshot({path: out + '/poster.png', omitBackground: true});
  console.log('poster ok'); await browser.close(); srv.close(); process.exit(0);
}
for (const [name, w, h, touch] of [['m', 390, 844, true], ['d', 1440, 900, false]]) {
  const p = await mk(w, h, touch); await p.goto(U + '/'); await ready(p); await p.waitForTimeout(500);
  const stage = p.locator('.stage');
  await stage.screenshot({path: `${out}/${name}-0-start.png`});
  for (const id of ['schulter', 'ruecken', 'knie', 'kopf', 'nacken', 'arm', 'huefte', 'fuss']) {
    await p.evaluate((id) => document.querySelector(`[data-zone="${id}"]`).click(), id); await p.waitForTimeout(350);
    await p.locator('.chart__map').screenshot({path: `${out}/${name}-${id}.png`});
  }
  res[name + 'Panel'] = await p.evaluate(() => [...document.querySelectorAll('[data-zone-panel]')].filter((x) => !x.hidden).map((x) => x.dataset.zonePanel));
  await p.evaluate(() => window.__body.still(Math.PI / 2)); await p.waitForTimeout(200); await p.locator('.chart__map').screenshot({path: `${out}/${name}-side.png`});
  // тап по фигуре: колено (по проекции зоны)
  if (name === 'd') {
    await p.evaluate(() => { window.__body.select(null); window.__body.still(0); document.querySelector('[data-zone="fuss"]').click(); document.querySelector('[data-zone="fuss"]').click(); });
    await p.waitForTimeout(300);
    const box = await p.locator('[data-canvas]').boundingBox();
    await p.mouse.click(box.x + box.width * 0.5 + 34, box.y + box.height * 0.72); await p.waitForTimeout(300);
    res.tapPicked = await p.evaluate(() => document.querySelector('[data-zone][aria-pressed="true"]')?.dataset.zone ?? null);
  }
  await p.evaluate(() => { window.__body.select(null); document.querySelector('[data-zone="schulter"]').click(); }); await p.waitForTimeout(700); await p.screenshot({path: `${out}/${name}-picked.png`}); await p.evaluate(() => document.querySelector('[data-zone="schulter"]').click());
  // запрос из панели → форма
  await p.evaluate(() => document.querySelector('[data-zone="schulter"]').click()); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('[data-zone-panel="schulter"] [data-ask]').click()); await p.waitForTimeout(400);
  res[name + 'Area'] = await p.evaluate(() => document.querySelector('#af-area').value);
  await p.locator('.af button[type=submit]').click(); res[name + 'Err'] = await p.locator('.af__err:visible').count();
  await p.fill('#af-name', 'Erika Beispiel'); await p.fill('#af-tel', '030 23125 123'); await p.check('input[name=privacy]');
  await p.reload(); await ready(p);
  res[name + 'Reload'] = await p.evaluate(() => ({name: document.querySelector('#af-name').value, area: document.querySelector('#af-area').value, consent: document.querySelector('input[name=privacy]').checked}));
  await p.check('input[name=privacy]'); await p.locator('.af button[type=submit]').click(); await p.waitForTimeout(200);
  res[name + 'Done'] = await p.locator('[data-af-list] > div').count();
  // рецепт, калькулятор, меню
  await p.click('[data-rx-btn="MLD"]'); res[name + 'Rx'] = await p.evaluate(() => document.querySelector('.rxout__item.is-on h3').textContent + ' | ' + document.querySelector('[data-rx-start]').textContent);
  await p.locator('#leistungen').screenshot({path: `${out}/${name}-rezept.png`});
  await p.locator('#termin').screenshot({path: `${out}/${name}-tape.png`});
  res[name + 'Kasse'] = await p.textContent('[data-bon-sum]');
  await p.click('[data-step="kasse"] [data-step-inc]'); await p.click('input[name=kheil][value=MT]', {force: true}); res[name + 'Kasse7MT'] = await p.textContent('[data-bon-sum]');
  await p.click('#way-selbst'); await p.click('[data-step="selbst"] [data-step-inc]'); res[name + 'Selbst2'] = await p.textContent('[data-bon-sum]');
  await p.locator('#kosten').screenshot({path: `${out}/${name}-kosten.png`});
  await p.locator('#team').screenshot({path: `${out}/${name}-team.png`});
  await p.locator('.kk summary').nth(1).click(); await p.locator('#fragen').screenshot({path: `${out}/${name}-kartei.png`});
  await p.locator('#anfrage').screenshot({path: `${out}/${name}-karte.png`});
  await p.locator('.rolle').screenshot({path: `${out}/${name}-rolle.png`});
  await p.evaluate(() => document.querySelector('.badge__z a').click()); await p.waitForTimeout(300); res[name + 'Goto'] = await p.evaluate(() => document.querySelector('[data-zone][aria-pressed="true"]')?.dataset.zone ?? null);
  await p.click('[data-menu-open]'); await p.waitForTimeout(200); await p.screenshot({path: `${out}/${name}-menu.png`});
  res[name + 'Overflow'] = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await p.click('.wand [data-theme-toggle]'); await p.waitForTimeout(300); await p.screenshot({path: `${out}/${name}-night.png`});
}
console.log(JSON.stringify({res, logs}, null, 1));
await browser.close(); srv.close();
