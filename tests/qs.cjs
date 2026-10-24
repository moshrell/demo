const { launch } = require('./lib.cjs');
const URL = (process.env.HOST || 'http://127.0.0.1:4400') + '/vorschau/auto/glanzleistung/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, m) => console.log((c ? 'OK   ' : 'FAIL ') + m);
(async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000);
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
  await page.goto(URL + '?qsdebug=1', { waitUntil: 'load' }); await sleep(600); await page.click('[data-intro-skip]'); await sleep(2500);
  // Station Anfahrt
  await page.click('[data-open="anfahrt"]'); await sleep(3500);
  const r = await page.evaluate(() => { const h = document.querySelector('[data-qs-hook]'); const b = h.getBoundingClientRect(); const cs = getComputedStyle(h); const sh = document.getElementById('sheet-anfahrt').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, pe: cs.pointerEvents, sheetTop: sh.top, vh: innerHeight, vis: getComputedStyle(h.closest('.world--st')).opacity }; });
  console.log('hook', JSON.stringify(r));
  ok(r.pe === 'auto', 'Hook klickbar an der Station');
  // Treffer-Fläche auf dem Bildschirm (::before -58/-64 Kartenpixel) → Faktor
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  console.log('Mitte', cx.toFixed(0), cy.toFixed(0), 'Panel ab y', r.sheetTop.toFixed(0));
  ok(cy < r.sheetTop - 10 && cx > 0 && cx < 390, 'Hook liegt im sichtbaren Teil über dem Panel');
  const scale = r.w / 24; console.log('Bildschirm-Faktor', scale.toFixed(3), '→ Tippfläche', (186 * scale).toFixed(0) + 'x' + (160 * scale).toFixed(0));
  // Kurz tippen startet nichts
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] }); await sleep(300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900);
  ok(await page.evaluate(() => !document.querySelector('dialog.qs')), 'Kurzes Tippen startet das Spiel nicht');
  // 1 s halten startet
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] }); await sleep(1300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForSelector('dialog.qs [data-go]', { timeout: 8000 });
  ok(true, 'Langes Halten öffnet das Spiel');
  ok(await page.evaluate(() => window.__qsOpen === true && !!document.querySelector('dialog.qs[open]')), 'Dialog offen, Zähler gesetzt');
  // Zurücktaste während Spiel: Spiel schließt, Anfahrt-Panel bleibt
  await page.goBack(); await sleep(700);
  ok(await page.evaluate(() => !document.querySelector('dialog.qs') && window.__qsOpen === false), 'Zurück schließt nur das Spiel');
  ok(await page.evaluate(() => document.getElementById('sheet-anfahrt').open), 'Anfahrt-Panel bleibt offen');
  // erneut starten, mit Bot gewinnen
  await page.evaluate(() => document.querySelector('[data-qs-hook]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await page.waitForSelector('dialog.qs [data-go]'); await page.click('dialog.qs [data-go]');
  await page.waitForFunction(() => window.__qs && window.__qs.state === 'race', null, { timeout: 8000 });
  // Sieg (Geist-Zeit ist 31,5 s) → Code → in den Auftrag übernehmen
  await page.evaluate(() => window.__qs.fakeFinish(27.5));
  await page.waitForSelector('[data-claim]');
  const code = await page.evaluate(() => document.querySelector('[data-code]').textContent);
  console.log('Code', code);
  await page.click('[data-claim]'); await sleep(3500);
  ok(await page.evaluate(() => !document.querySelector('dialog.qs') && !window.__qsOpen), 'Spiel geschlossen nach Übernahme');
  ok(await page.evaluate(() => document.getElementById('sheet-auftrag').open), 'Auftrag geöffnet');
  const f1 = await page.evaluate(() => ({ v: document.getElementById('o-code').value, msg: document.querySelector('[data-code-msg]').textContent, cls: document.querySelector('[data-code-msg]').className, hist: history.length }));
  console.log(JSON.stringify(f1));
  ok(f1.v === code && f1.cls.includes('is-ok'), 'Code im Feld und gültig');
  // ohne Leistung: kein Rabatt, aber Hinweis
  ok(/erscheint, sobald/.test(f1.msg), 'Hinweis: Rabatt erscheint mit Leistung');
  await page.click('#sheet-auftrag [data-close]'); await sleep(1800);
  // Leistung wählen → Rabatt in der Summe
  await page.click('[data-station="lack"]'); await sleep(500);
  if (await page.evaluate(() => document.getElementById('sheet-klasse').open)) { await page.click('#sheet-klasse [data-kl="kompakt"]'); }
  await sleep(5000); await page.click('[data-st-add]'); await sleep(1200);
  await page.click('.dock__cta'); await sleep(2500);
  const tk = await page.evaluate(() => ({ t: document.querySelector('[data-ticket]').innerText.replace(/\s+/g, ' '), sum: document.querySelector('[data-o-sum]').textContent, msg: document.querySelector('[data-code-msg]').textContent }));
  console.log(JSON.stringify(tk));
  ok(/Rabatt QS-2750/.test(tk.t), 'Rabattzeile im Bon');
  // Feld leeren → Rabatt weg; QUERSTEHER → Rabatt; Unsinn → Fehler
  await page.fill('#o-code', ''); await sleep(200);
  const s0 = await page.evaluate(() => document.querySelector('[data-o-sum]').textContent);
  await page.fill('#o-code', 'quersteher'); await sleep(200);
  const s1 = await page.evaluate(() => ({ sum: document.querySelector('[data-o-sum]').textContent, v: document.getElementById('o-code').value }));
  await page.fill('#o-code', 'QS-2987-K4'); await page.locator('#o-code').blur(); await sleep(200);
  const s2 = await page.evaluate(() => ({ sum: document.querySelector('[data-o-sum]').textContent, msg: document.querySelector('[data-code-msg]').textContent, inv: document.getElementById('o-code').getAttribute('aria-invalid') }));
  console.log('ohne Code', s0, '| QUERSTEHER', JSON.stringify(s1), '| ungültig', JSON.stringify(s2));
  ok(s1.sum !== s0 && s2.sum === s0 && s2.inv === 'true', 'Code-Logik: Rabatt nur bei gültigem Code');
  // Daten gehen nicht verloren: Datenschutz in neuer Tab-Logik, Formular bleibt (sessionStorage)
  await page.fill('#o-name', 'Anna Beispiel');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('form:gl-auftrag')));
  ok(saved.code === 'QS-2987-K4' && saved.name === 'Anna Beispiel', 'Code und Name im Formular-Speicher');
  await page.reload({ waitUntil: 'load' }); await sleep(600); await page.click('[data-intro-skip]'); await sleep(2500);
  await page.click('.dock__cta'); await sleep(2500);
  const after = await page.evaluate(() => ({ code: document.getElementById('o-code').value, name: document.getElementById('o-name').value }));
  ok(after.code === 'QS-2987-K4' && after.name === 'Anna Beispiel', 'Nach Neuladen sind Eingaben noch da');
  // Absenden mit ungültigem Code wird gestoppt
  const d = new Date(); d.setDate(d.getDate() + 3); if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  await page.fill('#o-tel', '0511 1234567'); await page.fill('#o-date', d.toISOString().slice(0, 10)); await page.check('input[name="privacy"]');
  await page.click('button[type="submit"]'); await sleep(600);
  ok(await page.evaluate(() => document.querySelector('[data-done]').hidden), 'Ungültiger Code verhindert das Absenden');
  await page.fill('#o-code', ''); await page.click('button[type="submit"]'); await sleep(900);
  ok(await page.evaluate(() => !document.querySelector('[data-done]').hidden), 'Ohne Code lässt sich der Auftrag senden');
  console.log('ERRS so far', JSON.stringify(errs.slice(0, 5)));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
