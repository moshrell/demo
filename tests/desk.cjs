// Desktop / Tablet quer: Garage im ganzen Fenster, Knöpfe an Auto und Wänden, Panel rechts, Kamera links davon, echte Pixel.
const { sleep, ok, done, launch, open, px, dist, carRegion, shot } = require('./lib.cjs');
const SERVICES = ['lack', 'felgen', 'innenraum', 'folie', 'ozon', 'dachhimmel'];
const STATIONS = ['zeiten', 'anfahrt', 'funk', 'auftrag', 'gaestebuch', 'recht'];
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const closeStation = (page) => page.evaluate(() => document.querySelector('[data-back]').click());
(async () => {
  const browser = await launch();
  for (const vp of [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 1024, h: 768 }, { w: 1440, h: 900 }, { w: 2560, h: 1080 }]) {
    const tag = `${vp.w}x${vp.h}`;
    const page = await open(browser, vp);
    ok(await page.evaluate(() => document.documentElement.classList.contains('desk') && window.__gl.G.desk), `${tag}: Desktop-Bühne aktiv`);
    const s0 = await px(page); ok(s0.luma > 30 && s0.dark < 0.5, `${tag}: Box nicht schwarz (Helligkeit ${s0.luma.toFixed(0)})`);
    // Knöpfe: 12 sichtbar, alle im Fenster, Etiketten überlappen sich nicht
    const pins = await page.evaluate(() => [...document.querySelectorAll('.hs')].filter((h) => h.offsetParent).map((h) => { const l = h.querySelector('.hs__lbl').getBoundingClientRect(); const d = h.querySelector('.hs__dot').getBoundingClientRect(); return { id: h.dataset.pin, x: l.x, y: l.y, width: l.width, height: l.height, dx: d.x + d.width / 2, dy: d.y + d.height / 2 }; }));
    ok(pins.length === 12, `${tag}: 12 Knöpfe (${pins.length})`);
    ok(pins.every((p) => p.dx > 0 && p.dx < vp.w && p.dy > 60 && p.dy < vp.h && p.x > -2 && p.x + p.width < vp.w + 2), `${tag}: alle Knöpfe im Fenster`);
    const bad = []; for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) if (overlap(pins[i], pins[j]) > 30) bad.push(pins[i].id + '/' + pins[j].id);
    ok(bad.length === 0, `${tag}: Etiketten überlappen nicht ${bad.join(', ')}`);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.svcs')).display === 'none' && getComputedStyle(document.querySelector('.dock')).display === 'none'), `${tag}: Handy-Karten und Dock aus`);
    // Stationen: Panel rechts, Nahaufnahme geladen, nichts verdeckt die Mitte der Nahaufnahme
    for (const id of STATIONS) {
      await page.click(`.hs[data-pin-open="${id}"]`); await sleep(2600);
      const r = await page.evaluate((id) => {
        const g = window.__gl; const d = document.querySelector('dialog.sheet--cam[open]'); const dr = d.getBoundingClientRect(); const fr = g.stage.frame.getBoundingClientRect();
        // Mitte der Fläche (Ecken aus media.json) auf dem Bildschirm: Station → Nahaufnahme-Koordinaten → Bildschirm
        const st = g.M.stations[id]; const [cx, cy, , ch] = st.crop; const k = g.M.H / ch; const c = g.stage.cam; const s = c.s / k;
        const q = st.corners; const mx = q.reduce((n, p) => n + p[0], 0) / 4, my = q.reduce((n, p) => n + p[1], 0) / 4;
        const sx = fr.x + c.tx + c.s * cx + s * mx, sy = fr.y + c.ty + c.s * cy + s * my;
        return { panelLeft: dr.left, panelW: dr.width, panelOpacity: getComputedStyle(d).opacity, sx, sy, op: g.stage.stOp, img: g.stage.stImg?.naturalWidth };
      }, id);
      ok(r.panelOpacity === '1' && r.panelLeft > vp.w * 0.5 && r.op > 0.95 && r.img === 2560, `${tag}: Station ${id}: Panel rechts (${Math.round(r.panelLeft)}px), Nahaufnahme scharf geladen`);
      ok(r.sx > 0 && r.sx < r.panelLeft - 10 && r.sy > 60 && r.sy < vp.h, `${tag}: Station ${id}: Objekt liegt links vom Panel (${Math.round(r.sx)},${Math.round(r.sy)})`);
      const s = await px(page); ok(s.luma > 20 && s.dark < 0.7, `${tag}: Station ${id}: Bild nicht schwarz (${s.luma.toFixed(0)})`);
      if (vp.w === 1920) await shot(page, `d-${id}`);
      await closeStation(page); await sleep(1600);
    }
    // Leistungen
    let first = true;
    for (const id of SERVICES) {
      await page.click(`.hs[data-hs="${id}"]`); await sleep(500);
      if (first) { await page.click('#sheet-klasse [data-kl="kompakt"]'); first = false; }
      await sleep(4200);
      const s = await px(page);
      const clip = await page.evaluate(() => { const w = document.querySelector('[data-clipworld]'); const i = document.querySelector('[data-clip-still]'); return { shown: !w.hidden, op: getComputedStyle(i).opacity, w: i.naturalWidth, src: i.getAttribute('src') }; });
      ok(s.luma > 20 && s.dark < 0.7, `${tag}: Leistung ${id}: Bild nicht schwarz (${s.luma.toFixed(0)})`);
      if (['lack', 'felgen', 'innenraum', 'ozon', 'dachhimmel'].includes(id)) ok(clip.shown && clip.op === '1' && clip.w === 1280, `${tag}: Leistung ${id}: Kamerafahrt-Standbild ${clip.src?.split('/').pop()} (${clip.w}px)`);
      if (vp.w === 1920) await shot(page, `d-svc-${id}`);
      await page.click('[data-st-add]'); await sleep(900);
    }
    const sum = await page.evaluate(() => document.querySelector('[data-sum]').textContent); ok(/\d/.test(sum) && sum !== '0 €', `${tag}: Summe im HUD (${sum})`);
    ok(page.errs.length === 0, `${tag}: keine Fehler ${JSON.stringify(page.errs.slice(0, 3))}`);
    await page.context().close();
  }
  // Folie am Desktop: echte Renders, Lack mit Folie, Felgen mit Folie (Zoom statt Video)
  let page = await open(browser, { w: 1920, h: 1080 });
  const ref = await px(page, await carRegion(page));
  await page.click('.hs[data-hs="folie"]'); await sleep(500); await page.click('#sheet-klasse [data-kl="klein"]'); await sleep(4200);
  for (const c of ['nordlicht', 'chromrose', 'perlmutt', 'pistazie', 'kirsch', 'tiefsee', 'giftgruen', 'graphit']) {
    await page.evaluate((c) => document.querySelector(`input[name="st-color"][value="${c}"]`).click(), c); await sleep(1100);
    const url = await page.evaluate(() => window.__gl.boxes.url); const s = await px(page, await carRegion(page));
    ok(url.includes(`/wrap/d/box-${c}-`) && s.luma > 25 && dist(s, ref) > 3, `Desktop Farbe ${c}: Render ${url.split('/').pop()}, Unterschied ${dist(s, ref).toFixed(1)}`);
  }
  await shot(page, 'd-folie');
  await page.evaluate(() => document.querySelector('input[name="st-color"][value="kirsch"]').click()); await sleep(900);
  await page.click('[data-st-add]'); await sleep(1500);
  await page.click('.hs[data-hs="lack"]'); await sleep(4200);
  let still = await page.evaluate(() => { const i = document.querySelector('[data-clip-still]'); return { src: i.getAttribute('src'), w: i.naturalWidth, op: getComputedStyle(i).opacity }; });
  ok(/wrap\/d\/hood-kirsch-/.test(still.src) && still.w === 1280 && still.op === '1', `Desktop Lack mit Folie zeigt Haube als Render (${still.src.split('/').pop()})`);
  await shot(page, 'd-lack-folie');
  await closeStation(page); await sleep(1500);
  await page.click('.hs[data-hs="felgen"]'); await sleep(4200);
  const f = await page.evaluate(() => ({ shown: !document.querySelector('[data-clipworld]').hidden, s: window.__gl.stage.cam.s, b: window.__gl.stage.base.s }));
  const fp = await px(page); ok(!f.shown && f.s > f.b * 1.5 && fp.luma > 20, `Desktop Felgen mit Folie: Zoom in die Box (x${(f.s / f.b).toFixed(1)}) statt Schwarz-Video, Helligkeit ${fp.luma.toFixed(0)}`);
  await shot(page, 'd-felgen-folie');
  ok(page.errs.length === 0, 'Folie am Desktop: keine Fehler ' + JSON.stringify(page.errs.slice(0, 3)));
  // Fenster ziehen: Desktop → Handy → Desktop, nichts bleibt schwarz oder hängt
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(2500);
  ok(await page.evaluate(() => !window.__gl.G.desk && !document.documentElement.classList.contains('desk') && /\/media\/(wrap\/m\/box-kirsch|box-clean)/.test(window.__gl.boxes.url)), 'Fenster → Handy: Handy-Bühne mit Handy-Bild');
  const m = await px(page); ok(m.luma > 30 && m.dark < 0.5, `Fenster → Handy: Bild nicht schwarz (${m.luma.toFixed(0)})`);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.svcs')).display !== 'none' && document.querySelectorAll('.hs:not([hidden])').length === 4), 'Fenster → Handy: Karten und 4 Punkte');
  await page.setViewportSize({ width: 1600, height: 900 }); await sleep(2500);
  ok(await page.evaluate(() => window.__gl.G.desk && window.__gl.boxes.url.includes('/wrap/d/box-kirsch')), 'Fenster → Desktop: Desktop-Bühne, Folie bleibt');
  const d2 = await px(page); ok(d2.luma > 30 && d2.dark < 0.5, `Fenster → Desktop: Bild nicht schwarz (${d2.luma.toFixed(0)})`);
  ok(page.errs.length === 0, 'Fenster ziehen: keine Fehler ' + JSON.stringify(page.errs.slice(0, 3)));
  // Tablet hochkant (820x1180) und Handy quer (844x390)
  { const t = await open(browser, { w: 820, h: 1180, mobile: true });
    ok(await t.evaluate(() => !window.__gl.G.desk && getComputedStyle(document.querySelector('.svcs')).display !== 'none' && document.querySelectorAll('.hs:not([hidden])').length === 4), 'Tablet hochkant: Handy-Layout, Karten, 4 Punkte');
    const tp = await px(t); ok(tp.luma > 30 && tp.dark < 0.5, `Tablet hochkant: Bild nicht schwarz (${tp.luma.toFixed(0)})`); ok(t.errs.length === 0, 'Tablet: keine Fehler');
    const l = await open(browser, { w: 844, h: 390, mobile: true });
    ok(await l.evaluate(() => window.__gl.G.desk), 'Handy quer: Desktop-Bühne');
    const lp = await px(l); ok(lp.luma > 30 && lp.dark < 0.5, `Handy quer: Bild nicht schwarz (${lp.luma.toFixed(0)})`); ok(l.errs.length === 0, 'Handy quer: keine Fehler'); }
  await browser.close(); done();
})();
