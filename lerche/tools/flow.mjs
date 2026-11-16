// Сценарий брони и план полёта: node tools/flow.mjs <WxH> <outDir>
import {chromium} from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [size, out] = process.argv.slice(2); const [W, H] = size.split('x').map(Number);
const root = path.resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'};
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r);
}).listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const ctx = await browser.newContext({viewport: {width: W, height: H}, hasTouch: W < 900, isMobile: W < 900});
const page = await ctx.newPage(); const logs = []; const res = {};
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/`, {waitUntil: 'load'});
await page.waitForFunction(() => ['1', '0'].includes(document.querySelector('#sky')?.dataset.live));
fs.mkdirSync(out, {recursive: true});
const shot = (n) => page.screenshot({path: `${out}/${n}.png`});
// план полёта
await page.click('.plan-open'); await page.waitForTimeout(400); await shot('1-plan');
await page.click('.plan__way a[data-jump="4"]'); await page.waitForTimeout(3500);
res.jumpAlt = await page.evaluate(() => document.querySelector('#gPress').textContent);
// пустая отправка → ошибки
await page.evaluate(() => document.querySelector('#book').scrollIntoView()); await page.waitForTimeout(500);
await page.click('.sum button'); await page.waitForTimeout(600);
res.errorsShown = await page.evaluate(() => [...document.querySelectorAll('.err')].filter((e) => !e.hidden).map((e) => e.id));
// выбор окна и мест
await page.click('.dawn:nth-of-type(2)'); await page.click('.seat--1'); await page.click('.seat--4');
res.takenDisabled = await page.evaluate(() => [...document.querySelectorAll('input[name=seat]')].filter((s) => s.disabled).map((s) => s.value));
res.sum = await page.evaluate(() => document.querySelector('#sumWhat').textContent + ' | ' + document.querySelector('#sumTotal').textContent);
await page.evaluate(() => document.querySelector('.cabin').scrollIntoView({block: 'center'})); await page.waitForTimeout(500); await shot('2-seats');
await page.fill('#fName', 'Ada Lindqvist'); await page.fill('#fMail', 'ada@example.com');
// перезагрузка: данные на месте, согласие нет
await page.reload({waitUntil: 'load'}); await page.waitForTimeout(1200);
res.restored = await page.evaluate(() => ({name: document.querySelector('#fName').value, seats: [...document.querySelectorAll('input[name=seat]:checked')].map((s) => s.value), consent: document.querySelector('#fOk').checked, sum: document.querySelector('#sumTotal').textContent}));
await page.evaluate(() => document.querySelector('.guest').scrollIntoView({block: 'center'})); await page.waitForTimeout(400);
await page.check('#fOk'); await shot('3-guest'); await page.click('.sum button'); await page.waitForTimeout(900); await shot('4-pass');
res.pass = await page.evaluate(() => document.querySelector('#pass').innerText.replace(/\n+/g, ' / '));
res.cleared = await page.evaluate(() => Object.keys(sessionStorage).length);
// вся капсула
await page.click('#again'); await page.click('.dawn:nth-of-type(4)'); for (let i = 1; i <= 6; i++) await page.click('.seat--' + i);
res.whole = await page.evaluate(() => document.querySelector('#sumWhat').textContent + ' | ' + document.querySelector('#sumTotal').textContent);
console.log(JSON.stringify({...res, logs}, null, 1));
await browser.close(); srv.close();
