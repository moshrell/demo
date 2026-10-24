const { launch } = require('./lib.cjs');
const URL = (process.env.HOST || 'http://127.0.0.1:4400') + '/vorschau/auto/glanzleistung/?gltest=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => console.log('ERR', e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable');
  let last = [];
  cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) last = e.layers; });
  const name = async (l) => { try { const n = (await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId })).node; const a = n.attributes || []; const i = a.indexOf('class'); return n.nodeName + (i >= 0 ? '.' + a[i + 1].split(' ').join('.') : ''); } catch { return '?'; } };
  const snap = () => Object.fromEntries(last.filter((l) => l.drawsContent).map((l) => [l.layerId, l]));
  const diff = async (tag, a, b) => {
    const bad = [];
    let big = 0;
    for (const [id, l] of Object.entries(b)) { const d = l.paintCount - (a[id]?.paintCount ?? 0); if (d > 6) bad.push(`${d}× ${Math.round(l.width)}x${Math.round(l.height)} ${await name(l)}`); big += l.width * l.height; }
    console.log(`${tag.padEnd(22)} layers=${Object.keys(b).length} area=${(big / 1e6).toFixed(1)}M ${bad.length ? 'REPAINT: ' + bad.join(' ; ') : 'ok'}`);
  };
  await page.goto(URL, { waitUntil: 'load' }); await sleep(600);
  await page.click('[data-intro-skip]'); await sleep(2500);
  const close = () => page.evaluate(() => document.querySelector('.sheet--cam[open] [data-close]')?.click());
  for (const id of ['zeiten', 'anfahrt', 'funk', 'gaestebuch', 'recht', 'auftrag']) {
    let a = snap(); await page.evaluate((id) => document.querySelector(`[data-open="${id}"]`).click(), id); await sleep(2600); await diff('→ ' + id, a, snap());
    a = snap(); await close(); await sleep(1700); await diff('← ' + id, a, snap());
  }
  let first = true;
  for (const id of ['lack', 'felgen', 'innenraum', 'folie', 'ozon', 'dachhimmel']) {
    let a = snap(); await page.click(`[data-station="${id}"]`); await sleep(700);
    if (first) { await page.click('[data-kl="kompakt"]'); first = false; }
    await sleep(3200); await diff('→ ' + id, a, snap());
    a = snap(); await close(); await sleep(1700); await diff('← ' + id, a, snap());
  }
  const m = await cdp.send('Performance.enable').then(() => cdp.send('Performance.getMetrics'));
  console.log(m.metrics.filter((x) => /JSHeapUsed|Nodes/.test(x.name)).map((x) => x.name + '=' + Math.round(x.value)).join(' '));
  await browser.close();
})();
