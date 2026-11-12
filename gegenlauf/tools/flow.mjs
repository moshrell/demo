// Проверка сценария из ТЗ числами (без картинок): модель → услуги → Summe → форма → подтверждение,
// горизонтальная прокрутка, ошибки консоли, запасные режимы. Сначала: DEMO_BASE=/ npm run build
import {chromium} from 'playwright-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('dist'); const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2'};
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); }).listen(0);
const url = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
async function run(name, {W, H, reduced = false, query = ''}) {
  const ctx = await browser.newContext({viewport: {width: W, height: H}, hasTouch: W < 900, isMobile: W < 700, reducedMotion: reduced ? 'reduce' : 'no-preference'});
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url + query); await page.waitForFunction('window.__szeneFertig === true', null, {timeout: 180000}); await page.waitForTimeout(800);
  const sum = () => page.evaluate(() => document.querySelector('[data-leiste-summe]').textContent);
  const tick = (id) => page.evaluate((id) => document.querySelector(`.pos[data-id=${id}] input`).click(), id);
  console.log(`— ${name} (${W}×${H}${reduced ? ', reduced-motion' : ''}${query ? ', ' + query : ''})`);
  ok((await page.evaluate(() => document.querySelector('#szene').dataset.live)) === (query ? '0' : '1'), 'сцена: ' + (query ? 'запасные кадры' : 'живая'));
  await page.evaluate(() => document.querySelector('#service').scrollIntoView({behavior: 'instant'})); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('input[name=modell_chip][value="987"]').click());
  ok(await page.evaluate(() => document.querySelector('.pos[data-id=ims-lager]').hidden), '987: IMS-Lager скрыт');
  await tick('kleine-wartung'); await page.waitForTimeout(1800); ok((await sum()) === 'ab 590 €', 'Kleine Wartung → ' + await sum());
  await tick('zuendkerzen'); await page.waitForTimeout(1800); ok((await sum()) === 'ab 830 €', '+ Zündkerzen → ' + await sum());
  await page.evaluate(() => document.querySelector('.zchip[data-zone=bremsen]').click()); await tick("bremsfluessigkeit"); await page.waitForTimeout(1800);
  ok((await sum()) === 'ab 950 €', '+ Bremsflüssigkeit → ' + await sum());
  await page.evaluate(() => document.querySelector('input[name=modell_chip][value="996"]').click()); await page.waitForTimeout(600);
  ok((await sum()) === 'ab 1.040 €', 'модель 996 → ' + await sum());
  await page.reload(); await page.waitForFunction('window.__szeneFertig === true', null, {timeout: 180000}); await page.waitForTimeout(600);
  ok((await sum()) === 'ab 1.040 €', 'после перезагрузки выбор сохранён → ' + await sum());
  await page.evaluate(() => document.querySelector('[data-ziel]').click()); await page.waitForTimeout(900);
  ok(await page.evaluate(() => document.querySelectorAll('[data-wahl] li').length === 3 && document.querySelector('#f-modell').value === '996'), 'форма: модель и 3 услуги подставлены');
  await page.evaluate(() => document.querySelector('.ta__senden').click());
  ok(await page.evaluate(() => !document.querySelector('#e-name').hidden && !document.querySelector('#e-privacy').hidden && document.activeElement.id === 'f-name'), 'пустая отправка: ошибки у имени и согласия, фокус на имени');
  await page.fill('#f-name', 'Erika Mustermann'); await page.fill('#f-tel', '030 23125 123'); await page.fill('#f-jahr', '2003');
  await page.evaluate(() => { document.querySelector('input[name=privacy]').click(); document.querySelector('.ta__senden').click(); });
  ok(await page.evaluate(() => !document.querySelector('[data-fertig]').hidden && /1\.040/.test(document.querySelector('[data-fertig]').textContent) && /Werktag/.test(document.querySelector('[data-fertig] h3').textContent)), 'подтверждение: список, сумма, срок звонка');
  for (const sel of ['#warum', '#werkstatt', '#kontakt']) { await page.evaluate((s) => document.querySelector(s).scrollIntoView({behavior: 'instant'}), sel); await page.waitForTimeout(150); }
  const m = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, small: [...document.querySelectorAll('a.btn, button, .zchip, .chip span, summary, .pos__kopf')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 43.5; }).map((e) => e.className + ':' + Math.round(e.getBoundingClientRect().height))}));
  ok(m.sw <= m.cw, `нет горизонтальной прокрутки (${m.sw}/${m.cw})`);
  ok(m.small.length === 0, 'зоны нажатия ≥ 44 px' + (m.small.length ? ' — малы: ' + [...new Set(m.small)].join(', ') : ''));
  ok(errs.length === 0, 'консоль без ошибок' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await run('телефон', {W: 390, H: 844});
await run('узкий телефон', {W: 320, H: 640});
await run('телефон, меньше движения', {W: 390, H: 844, reduced: true});
await run('телефон, без 3D', {W: 390, H: 844, query: '?ohne3d'});
await run('ПК', {W: 1440, H: 810});
await browser.close(); srv.close();
console.log(fail ? `\nПровалено проверок: ${fail}` : '\nВсе проверки пройдены');
process.exit(fail ? 1 : 0);
