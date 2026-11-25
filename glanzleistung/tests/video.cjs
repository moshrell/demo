// Videos: Headless-Chromium spielt kein H.264. Darum werden die MP4 für den Test live in VP9 umgewandelt (ffmpeg) und unter dem MP4-Namen ausgeliefert.
// Geprüft: Intro läuft bis zum Ende und blendet in die Box über, Kamerafahrten (Lack, Innenraum, am Desktop auch Felgen) spielen und enden im Standbild.
const { execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const { BASE, sleep, ok, done, launch, px } = require('./lib.cjs');
const dist = path.resolve(__dirname, '..', 'dist', 'media'); const tmp = fs.mkdtempSync('/tmp/gl-vp9-');
const conv = (rel) => { const out = path.join(tmp, rel.replace(/\//g, '_') + '.webm'); if (!fs.existsSync(out)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dist, rel), '-an', '-c:v', 'libvpx-vp9', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8', out]); return out; };
async function ctxFor(browser, vp) {
  const mobile = vp.w < 700; const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: mobile, hasTouch: mobile });
  await ctx.route('**/media/**/*.mp4', (r) => { const rel = new URL(r.request().url()).pathname.split('/media/')[1]; r.fulfill({ path: conv(rel), contentType: 'video/webm' }); });
  await ctx.route('**/media/*.mp4', (r) => { const rel = new URL(r.request().url()).pathname.split('/media/')[1]; r.fulfill({ path: conv(rel), contentType: 'video/webm' }); });
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text()); });
  await page.goto(BASE + '?gltest=1', { waitUntil: 'load' }); return page;
}
(async () => {
  const browser = await launch();
  for (const vp of [{ w: 390, h: 844, n: 'Handy' }, { w: 1600, h: 900, n: 'Desktop' }]) {
    const page = await ctxFor(browser, vp); const src = vp.w < 700 ? 'intro-m' : 'intro-d';
    await sleep(2500);
    const t1 = await page.evaluate(() => { const v = document.querySelector('[data-intro-video]'); return { src: v.getAttribute('src'), t: v.currentTime, paused: v.paused, poster: v.poster }; });
    ok(t1.src.endsWith(src + '.mp4') && !t1.paused && t1.t > 0.5, `${vp.n}: Intro ${t1.src.split('/').pop()} läuft (t=${t1.t.toFixed(1)} s)`);
    await sleep(6500);
    const ended = await page.evaluate(() => ({ out: document.querySelector('[data-intro]').classList.contains('is-out') || document.querySelector('[data-intro]').hidden, dur: document.querySelector('[data-intro-video]').duration }));
    ok(ended.out, `${vp.n}: Intro endet (${ended.dur.toFixed(1)} s) und blendet in die Box über`);
    await sleep(900); const s = await px(page); ok(s.luma > 30 && s.dark < 0.5, `${vp.n}: Box nach dem Intro nicht schwarz (${s.luma.toFixed(0)})`);
    const flights = vp.w < 700 ? [['lack', '[data-station="lack"]'], ['innenraum', '[data-station="innenraum"]']] : [['lack', '.wall [data-station="lack"]'], ['felgen', '.wall [data-station="felgen"]'], ['innenraum', '.wall [data-station="innenraum"]']];
    let first = true;
    for (const [id, sel] of flights) {
      await page.click(sel); await sleep(600);
      if (first) { await page.click('#sheet-klasse [data-kl="klein"]'); first = false; }
      await sleep(900);
      const mid = await page.evaluate(() => { const v = document.querySelector('[data-clip-video]'); return { playing: !v.paused && v.currentTime > 0, t: v.currentTime, name: v.dataset.name, op: getComputedStyle(v).opacity }; });
      await sleep(3200);
      const end = await page.evaluate(() => { const i = document.querySelector('[data-clip-still]'); const v = document.querySelector('[data-clip-video]'); return { still: getComputedStyle(i).opacity, vop: getComputedStyle(v).opacity, ended: v.ended || v.paused, sheet: document.getElementById('sheet-station').open && !document.getElementById('sheet-station').classList.contains('is-pre') }; });
      ok(mid.playing || mid.t > 0, `${vp.n}: ${id}: Kamerafahrt spielt (${mid.name}, t=${mid.t.toFixed(2)})`);
      ok(end.still === '1' && end.vop === '0' && end.sheet, `${vp.n}: ${id}: endet im Standbild, Panel sichtbar`);
      await page.click('[data-st-add]'); await sleep(1000);
    }
    ok(page.errs.length === 0, `${vp.n}: keine Fehler ${JSON.stringify(page.errs.slice(0, 3))}`);
    await page.context().close();
  }
  await browser.close(); done();
})();
