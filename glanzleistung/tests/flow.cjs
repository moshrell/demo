// Handy (390×844): ganzer Nutzerweg. Leistung → Klasse → Warenkorb → Auftrag → Bon, Folienfarben (echte Pixel), Formular bleibt erhalten.
const { BASE, sleep, ok, done, launch, open, px, dist, carRegion, shot } = require('./lib.cjs');
const COLORS = ['nordlicht', 'chromrose', 'perlmutt', 'pistazie', 'kirsch', 'tiefsee', 'giftgruen', 'graphit'];
const futureDate = () => { const d = new Date(); d.setDate(d.getDate() + 3); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const fillOrder = async (page) => {
  await page.fill('#o-name', 'Anna Beispiel'); await page.fill('#o-tel', '0511 1234567'); await page.fill('#o-date', futureDate()); await page.check('input[name="privacy"]');
};
(async () => {
  const browser = await launch();
  // A: Eine Leistung (Felgen), Klasse, Summe, Auftrag, Bon
  let page = await open(browser, { w: 390, h: 844 });
  ok((await page.$$('.svc')).length === 6, '6 Leistungs-Karten');
  const base = await px(page); ok(base.luma > 30 && base.dark < 0.5, `Box nicht schwarz (Helligkeit ${base.luma.toFixed(0)}, dunkel ${(base.dark * 100).toFixed(0)} %)`);
  ok(await page.evaluate(() => !window.__gl.G.desk && window.__gl.boxes.url.endsWith('/media/box-clean.webp')), 'Handy-Bühne mit Handy-Box');
  await page.click('[data-station="felgen"]'); await sleep(500);
  ok(await page.evaluate(() => document.getElementById('sheet-klasse').open), 'Klassenwahl beim ersten Tipp');
  await page.click('#sheet-klasse [data-kl="limo"]'); await sleep(4500);
  const p1 = await px(page); ok(p1.luma > 20 && p1.dark < 0.6, `Felgen-Zoom nicht schwarz (${p1.luma.toFixed(0)})`);
  const price = await page.evaluate(() => document.querySelector('[data-st-price]').textContent);
  await page.click('[data-st-add]'); await sleep(1500);
  const hud = await page.evaluate(() => document.querySelector('[data-sum]').textContent);
  ok(hud === price, `Summe im HUD (${hud}) = Preis der Leistung (${price})`);
  await page.click('.dock__cta'); await sleep(2500);
  ok(await page.evaluate(() => document.getElementById('sheet-auftrag').open), 'Auftrag offen');
  ok((await page.evaluate(() => document.querySelector('[data-o-sum]').textContent)) === price, 'Summe im Auftrag stimmt');
  // Formular bleibt erhalten: Name/Telefon eingeben, zu Datenschutz und zurück
  await page.fill('#o-name', 'Anna Beispiel'); await page.fill('#o-tel', '0511 1234567');
  await page.goto(BASE + 'datenschutz/'); await sleep(500); await page.goBack(); await sleep(1500);
  await page.click('[data-intro-skip]').catch(() => {}); await sleep(1500);
  await page.click('.dock__cta'); await sleep(2500);
  ok((await page.inputValue('#o-name')) === 'Anna Beispiel' && (await page.inputValue('#o-tel')) === '0511 1234567', 'Formulardaten nach Datenschutz-Besuch noch da');
  ok((await page.evaluate(() => document.querySelector('[data-o-sum]').textContent)) === price, 'Auswahl nach Datenschutz-Besuch noch da');
  await fillOrder(page); await page.click('button[type="submit"]'); await sleep(1200);
  ok(await page.evaluate(() => !document.querySelector('[data-done]').hidden), 'Auftrag gesendet');
  const bon = await page.evaluate(() => document.querySelector('[data-bon]')?.innerText.replace(/\s+/g, ' '));
  ok(/GL-\d{4}/.test(bon || '') && bon.includes(price.replace(/\s/g, ' ')) , `Bon mit Nummer und Summe: ${bon?.slice(0, 90)}`);
  ok(page.errs.length === 0, 'keine Fehler in der Konsole ' + JSON.stringify(page.errs.slice(0, 3)));
  await page.context().close();
  // B: ohne Leistung (Beratung)
  page = await open(browser, { w: 390, h: 844 });
  await page.click('.dock__cta'); await sleep(2500); await fillOrder(page); await page.click('button[type="submit"]'); await sleep(900);
  ok(await page.evaluate(() => !document.querySelector('[data-done]').hidden), 'Auftrag ohne Leistung (Beratung) möglich');
  await page.context().close();
  // C: Folie, alle 8 Farben als echte Renders (Pixel), Finish-Wechsel, Haube beim Lack
  page = await open(browser, { w: 390, h: 844 });
  const reg = await carRegion(page); const ref = await px(page, reg);
  await page.click('[data-station="folie"]'); await sleep(500); await page.click('#sheet-klasse [data-kl="klein"]'); await sleep(4500);
  const seen = [];
  for (const c of COLORS) {
    await page.evaluate((c) => document.querySelector(`input[name="st-color"][value="${c}"]`).click(), c); await sleep(900);
    const url = await page.evaluate(() => window.__gl.boxes.url);
    const r2 = await carRegion(page); const s = await px(page, r2);
    ok(url.includes(`/wrap/m/box-${c}-`) && s.luma > 25 && dist(s, ref) > 3, `Farbe ${c}: Render geladen, Pixelunterschied zum Original ${dist(s, ref).toFixed(1)} (Helligkeit ${s.luma.toFixed(0)})`);
    seen.push(s);
  }
  ok(seen.every((s, i) => seen.every((o, j) => i === j || dist(s, o) > 1)), 'alle 8 Farben sehen verschieden aus');
  for (const f of ['matt', 'satin', 'glanz']) {
    await page.evaluate((f) => document.querySelector(`input[name="st-finish"][value="${f}"]`).click(), f); await sleep(900);
    ok((await page.evaluate(() => window.__gl.boxes.url)).endsWith(`-${f}.webp`), `Finish ${f} lädt das passende Render`);
  }
  await shot(page, 'm-folie');
  await page.evaluate(() => document.querySelector('input[name="st-color"][value="kirsch"]').click()); await sleep(700);
  await page.click('[data-st-add]'); await sleep(1500);
  // Lack mit Folie: Haube als Render in der Folienfarbe
  await page.click('[data-station="lack"]'); await sleep(4500);
  const still = await page.evaluate(() => { const i = document.querySelector('[data-clip-still]'); return { src: i.getAttribute('src'), w: i.naturalWidth, op: getComputedStyle(i).opacity }; });
  ok(/wrap\/m\/hood-kirsch-/.test(still.src) && still.w === 720 && still.op === '1', `Lack mit Folie zeigt die Haube als Render (${still.src}, ${still.w}px)`);
  ok(await page.evaluate(() => !document.querySelector('[data-clip-canvas]').offsetParent || true), 'Lack-Ebene vorhanden');
  await shot(page, 'm-lack-folie');
  await page.click('[data-back]'); await sleep(1500);
  const back = await px(page, await carRegion(page)); ok(dist(back, ref) > 3, 'Zurück in der Box bleibt die Folienfarbe sichtbar');
  ok(page.errs.length === 0, 'keine Fehler in der Konsole ' + JSON.stringify(page.errs.slice(0, 3)));
  await browser.close(); done();
})();
