// Проход по сценариям: главная (цель, вкладки, аккордеон, ночь, форма) и Check (датчики подставные + ручной режим).
// DEMO_BASE=/ npx astro build && CHROME=... node tools/flow.mjs <outDir>
import {chromium} from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const out = process.argv[2] || '/tmp/flow'; fs.mkdirSync(out, {recursive: true});
const root = path.resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg'};
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); }).listen(0);
const U = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({executablePath: process.env.CHROME, headless: true, args: ['--no-sandbox']});
const res = {}; const logs = [];
const mk = async (w, h, touch = true) => { const c = await browser.newContext({viewport: {width: w, height: h}, hasTouch: touch, isMobile: touch, timezoneId: 'Europe/Berlin'}); const p = await c.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text()); }); p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message)); return p; };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// --- главная, телефон
let p = await mk(390, 844);
await p.goto(U + '/'); await p.waitForTimeout(600);
res.wordFs = await p.evaluate(() => getComputedStyle(document.querySelector('[data-word]')).fontSize);
const fitAll = [];
for (const id of ['schlafen', 'tragen', 'sitzen', 'treppen', 'tennis', 'laufen']) {
  await p.click(`[data-goal="${id}"]`); await p.waitForTimeout(400);
  fitAll.push(await p.evaluate(() => { const w = document.querySelector('[data-word]'); w.style.setProperty('--wdth', '100'); w.classList.add('is-drag'); const r = Math.max(...[...w.querySelectorAll('.word__tape')].map((e) => e.getBoundingClientRect().right)); w.classList.remove('is-drag'); w.style.removeProperty('--wdth'); return Math.round(r); }));
}
res.wordRightAtFullStretch = fitAll; // должно быть ≤ 390 - поле
await p.click('[data-goal="tragen"]'); await p.waitForTimeout(500); await p.screenshot({path: out + '/home-goal.png'});
// вкладки и аккордеон
await p.click('#tab-selbst'); res.tabSelbst = await p.isVisible('#panel-selbst'); res.tabKasseHidden = !(await p.isVisible('#panel-kasse'));
await p.locator('.hilfe .acc__item summary').nth(1).click(); await p.waitForTimeout(300);
await p.locator('.hilfe').screenshot({path: out + '/hilfe.png'});
await p.locator('.kosten').screenshot({path: out + '/kosten.png'});
await p.locator('.praxis').screenshot({path: out + '/praxis.png'});
// форма: пустая отправка → ошибки; заполнение; Datenschutz в новой вкладке; перезагрузка не теряет; согласие не восстанавливается
await p.locator('.af button[type=submit]').click();
res.errShown = await p.locator('.af__err:visible').count();
await p.fill('#af-name', 'Erika Beispiel'); await p.fill('#af-tel', '030 23125 123'); await p.locator('.af__chip', {hasText: 'Schulter'}).click(); await p.locator('.af__chip', {hasText: 'Abends'}).click();
await p.check('input[name=privacy]'); await p.reload(); await p.waitForTimeout(500);
res.afterReload = await p.evaluate(() => ({name: document.querySelector('#af-name').value, area: document.querySelector('input[name=area]:checked').value, time: [...document.querySelectorAll('input[name=time]:checked')].map((x) => x.value), consent: document.querySelector('input[name=privacy]').checked}));
await p.locator('.anfrage').screenshot({path: out + '/form.png'});
await p.check('input[name=privacy]'); await p.locator('.af button[type=submit]').click(); await p.waitForTimeout(300);
res.doneVisible = await p.isVisible('[data-af-done]'); res.doneRows = await p.locator('[data-af-list] > div').count();
await p.locator('.anfrage').screenshot({path: out + '/form-done.png'});
res.overflowHome = await overflow(p);
// ночь
await p.click('[data-theme-toggle]'); await p.waitForTimeout(400);
res.nightVisible = await p.isVisible('.nacht'); await p.screenshot({path: out + '/night.png'});
await p.click('[data-breath-btn]'); await p.waitForTimeout(4600); res.breathPhase = await p.evaluate(() => document.querySelector('[data-breath]').dataset.phase);
res.overflowNight = await overflow(p);
await p.evaluate(() => scrollTo(0, 1700)); await p.waitForTimeout(500); await p.screenshot({path: out + '/night-2.png'});

// --- Check с подставными датчиками
p = await mk(390, 844);
await p.goto(U + '/check/'); await p.waitForTimeout(400); await p.screenshot({path: out + '/check-intro.png'});
const ori = (a, b, g) => p.evaluate(([a, b, g]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {alpha: a, beta: b, gamma: g})), [a, b, g]);
const hold = async (a, b, g, ms) => { const n = Math.ceil(ms / 40); for (let i = 0; i < n; i++) { await ori(a, b, g); await p.waitForTimeout(40); } };
const sweep = async (f, from, to, ms) => { const n = Math.ceil(ms / 30); for (let i = 0; i <= n; i++) { const v = from + ((to - from) * i) / n; await ori(...f(v)); await p.waitForTimeout(30); } };
await p.click('[data-start]'); await p.waitForTimeout(250); await hold(10, 90, 0, 300);
res.stepTitle1 = await p.textContent('[data-step-h]');
// шея: телефон вертикально (beta 90), поворот влево 68°, вправо 47°
await p.click('[data-go]'); await hold(10, 90, 0, 900);
const neck = (v) => [10 + v, 90, 0];
await sweep(neck, 0, 68, 500); await sweep(neck, 68, 0, 400); await sweep(neck, 0, -47, 500); await sweep(neck, -47, 0, 400); await hold(10, 90, 0, 1100);
res.neck = await p.evaluate(() => document.querySelector('[data-step-gauge] svg').getAttribute('aria-label'));
await p.screenshot({path: out + '/check-step.png'});
await p.click('[data-next]');
// углы Эйлера (alpha, beta, gamma) из осей устройства x, y, z в мировых координатах
const mul = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const rot = (ax, d) => { const t = (d * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), [x, y, z] = ax, C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]]; };
const euler = (x, y, z) => { const D = 180 / Math.PI; return [Math.atan2(-y[0], y[1]) * D, Math.asin(Math.max(-1, Math.min(1, y[2]))) * D, Math.atan2(-x[2], z[2]) * D]; };
// плечо: рука вниз (верх телефона вниз), подъём вперёд-вверх = вращение вокруг мировой оси X
for (const top of [160, 128]) {
  const x0 = [1, 0, 0], y0 = [0, 0.02, -0.9998], z0 = [0, 0.9998, 0.02];
  const arm = (v) => { const R = rot([1, 0, 0], v); return euler(mul(R, x0), mul(R, y0), mul(R, z0)); };
  await p.click('[data-go]'); await hold(...arm(0), 900);
  await sweep(arm, 0, top, 700); await sweep(arm, top, 0, 600); await hold(...arm(0), 1100);
  await p.click('[data-next]');
}
res.stepTitle4 = await p.textContent('[data-step-h]');
// корпус: телефон вертикально, наклон вбок = вращение вокруг нормали экрана
{ const x0 = [1, 0, 0], y0 = [0, 0, 1], z0 = [0, -1, 0];
  const lean = (v) => { const R = rot(z0, v); return euler(mul(R, x0), mul(R, y0), mul(R, z0)); };
  await p.click('[data-go]'); await hold(...lean(0), 900);
  await sweep(lean, 0, 28, 500); await sweep(lean, 28, 0, 400); await sweep(lean, 0, -36, 500); await sweep(lean, -36, 0, 400); await hold(...lean(0), 1100);
  res.trunk = await p.evaluate(() => document.querySelector('[data-step-gauge] svg').getAttribute('aria-label'));
  await p.click('[data-next]'); }
await p.waitForTimeout(300);
res.resultVisible = await p.isVisible('[data-screen="result"]');
res.resultNotes = await p.locator('.res').evaluateAll((els) => els.map((e) => e.querySelector('svg').getAttribute('aria-label') + ' | ' + e.querySelector('.res__note').textContent));
await p.screenshot({path: out + '/check-result.png', fullPage: true});
res.overflowCheck = await overflow(p);
res.saved = await p.evaluate(() => localStorage.getItem('wohlauf:check'));
await p.click('[data-send]'); await p.waitForTimeout(700);
res.attach = await p.evaluate(() => ({shown: !document.querySelector('[data-af-result]').hidden, checked: document.querySelector('input[name=attach]').checked, text: document.querySelector('[data-af-result-text]').textContent, y: Math.round(scrollY)}));

// --- Check руками (ПК)
p = await mk(1280, 800, false);
await p.goto(U + '/en/check/'); await p.waitForTimeout(300);
res.deskSensorBtnHidden = !(await p.isVisible('[data-start]'));
await p.click('[data-start-manual]'); await p.waitForTimeout(200);
await p.fill('#m-l', '75'); await p.fill('#m-r', '50'); await p.screenshot({path: out + '/check-manual.png'});
for (let i = 0; i < 4; i++) { await p.click('[data-step-next]'); await p.waitForTimeout(100); }
res.manualResult = await p.locator('.res').evaluateAll((els) => els.map((e) => e.querySelector('svg').getAttribute('aria-label')));
res.overflowCheckDesk = await overflow(p);
console.log(JSON.stringify({res, logs}, null, 1));
await browser.close(); srv.close();
