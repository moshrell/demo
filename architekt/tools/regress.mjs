// Регресс-проверка после правок: что изменилось на сайте по сравнению с последним коммитом (или другим ref).
// Собирает «до» (git ref) и «после» (рабочая папка), обходит все страницы на нескольких экранах и сравнивает:
//   1) геометрию: какие блоки сдвинулись, выросли, пропали, появились (с какого блока начинается сдвиг);
//   2) пиксели: где на странице что-то поменялось (вырезки «до | после | разница» по каждому месту);
//   3) логику «после»: ошибки консоли, битые ссылки и якоря, выход за край экрана, обрезанный текст,
//      формы (данные переживают перезагрузку, ссылки Datenschutz/Impressum в форме открываются в новой вкладке).
// Плюс АУДИТ: ошибки текущей версии сами по себе, даже если они были и раньше (наложения текста, контраст,
//   мелкие зоны нажатия, мелкий шрифт, размытые/битые картинки, заголовки, большие пустоты, прыжки вёрстки и т. д.).
// Запуск из папки проекта:  node tools/regress.mjs [ref=HEAD] [outDir=/tmp/regress-<проект>]
//                    только аудит без сравнения:  node tools/regress.mjs --audit [outDir]
// Настройка через переменные: REGRESS_BUILD (команда сборки, по умолчанию «npx astro build» с DEMO_BASE=/),
//   REGRESS_DIST (папка сборки, по умолчанию dist), REGRESS_EXCLUDE (регэксп путей страниц, которые пропустить)
// Итог: <outDir>/report.md (+ PNG-вырезки). Смотреть вырезки по каждому изменению и решать: задумано или побочный эффект.
// Нужен playwright-core (devDependency) и Chrome: CHROME=/путь (по умолчанию /usr/bin/google-chrome).
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';

const proj = process.cwd();
const slug = path.basename(proj);
const AUDIT_ONLY = process.argv[2] === '--audit';
const ref = AUDIT_ONLY ? null : process.argv[2] || 'HEAD';
const out = path.resolve(process.argv[3] || path.join(os.tmpdir(), `regress-${slug}`));
const BUILD = process.env.REGRESS_BUILD || 'npx astro build';
const DIST = process.env.REGRESS_DIST || 'dist';
const EXCLUDE = process.env.REGRESS_EXCLUDE ? new RegExp(process.env.REGRESS_EXCLUDE) : null;
const VIEWS = (process.env.VIEWS || '360x740,390x844,844x390,768x1024,1280x800').split(',').map((s) => s.split('x').map(Number));
const sh = (cmd, cwd = proj) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DEMO_BASE: '/' } }).toString();

fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---------- 1. Сборки «до» и «после» ----------
console.log('build: после (рабочая папка)');
sh(BUILD);
fs.cpSync(path.join(proj, DIST), path.join(out, 'after'), { recursive: true });
fs.mkdirSync(path.join(out, 'before'), { recursive: true });

if (!AUDIT_ONLY) {
const top = sh('git rev-parse --show-toplevel').trim();
const rel = path.relative(top, proj);
const wt = path.join(os.tmpdir(), `regress-wt-${slug}`);
try { sh(`git worktree remove --force "${wt}"`, top); } catch { /* Arbeitsbaum existierte nicht */ }
console.log(`build: до (${ref})`);
sh(`git worktree add --detach "${wt}" ${ref}`, top);
try {
  const wproj = path.join(wt, rel);
  if (!fs.existsSync(wproj)) throw new Error(`в ${ref} нет папки ${rel}`);
  fs.symlinkSync(path.join(proj, 'node_modules'), path.join(wproj, 'node_modules'));
  sh(BUILD, wproj);
  fs.cpSync(path.join(wproj, DIST), path.join(out, 'before'), { recursive: true });
} finally {
  sh(`git worktree remove --force "${wt}"`, top);
}
}

// ---------- 2. Сервер для обеих сборок ----------
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary' };
const serve = (root) => {
  const s = http.createServer((q, r) => {
    let f = path.join(root, decodeURIComponent(q.url.split('?')[0].split('#')[0]));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  }).listen(0);
  return { s, url: `http://127.0.0.1:${s.address().port}` };
};
const A = serve(path.join(out, 'after')), B = serve(path.join(out, 'before'));

const pagesIn = (root) => {
  const res = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html') res.push('/' + path.relative(root, path.dirname(p)).split(path.sep).join('/') + (path.dirname(p) === root ? '' : '/'));
  });
  walk(root); return res.map((p) => p.replace('//', '/')).filter((p) => !EXCLUDE || !EXCLUDE.test(p)).sort();
};
const pagesA = pagesIn(path.join(out, 'after')), pagesB = pagesIn(path.join(out, 'before'));
const pages = [...new Set([...pagesA, ...pagesB])];

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

// Ruhiger Zustand: reduced-motion, keine Animationen/Übergänge, Videos angehalten, Caret aus
const CALM = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

async function capture(base, p, [W, H]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 900, hasTouch: W < 900, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  page.on('requestfailed', (r) => logs.push('REQUEST FAILED ' + r.url().replace(base, '')));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`HTTP ${r.status()} ${r.url().replace(base, '')}`); });
  await page.goto(base + p, { waitUntil: 'load' });
  await page.addStyleTag({ content: CALM });
  await page.evaluate(() => document.fonts.ready);
  // einmal durchscrollen (Lazy-Bilder, Beobachter), dann nach oben
  const h0 = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h0; y += Math.round(H * 0.8)) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(60); }
  await page.evaluate(() => { scrollTo(0, 0); document.querySelectorAll('video').forEach((v) => { v.pause(); }); });
  await page.waitForTimeout(500);
  const geo = await page.evaluate(() => {
    const sel = 'header,nav,main,section,footer,form,figure,h1,h2,h3,h4,p,ul,ol,dl,details,button,a.btn,.btn,input,select,textarea,label,img,video,svg[class],[id],[class*="card"],[class*="grid"]';
    const seen = new Map(); const items = [];
    const key = (e) => {
      const parts = []; let n = e;
      for (let i = 0; i < 3 && n && n !== document.body; i++, n = n.parentElement) {
        parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : n.classList[0] ? '.' + n.classList[0] : ''));
        if (n.id) break;
      }
      return parts.join('>');
    };
    document.querySelectorAll(sel).forEach((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (e.closest('[aria-hidden="true"]') && !e.matches('img,svg')) return;
      const k = key(e); const i = seen.get(k) || 0; seen.set(k, i + 1);
      items.push({ k: `${k}[${i}]`, t: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 50), x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, pad: cs.padding, mar: cs.margin, col: cs.color, bg: cs.backgroundColor });
    });
    return { items, H: document.documentElement.scrollHeight, W: document.documentElement.scrollWidth };
  });
  const audit = await page.evaluate(AUDIT, W);
  const shot = await page.screenshot({ fullPage: true });
  await ctx.close();
  return { geo, shot, logs, audit };
}


// ---------- Аудит одной страницы на одном экране (ошибки сами по себе, без сравнения) ----------
const AUDIT = (W) => {
  const out = []; const phone = W < 600;
  // sichtbar = wird wirklich gezeichnet (auch nicht in geschlossenem <details>, nicht unsichtbar über Eltern), liegt nicht über dem Seitenanfang
  const vis = (e) => { const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || r.bottom + scrollY < 0) return false; if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false; return !e.closest('[aria-hidden="true"],[hidden],[inert]'); };
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : e.classList[0] ? '.' + e.classList[0] : ''} «${(e.textContent || e.getAttribute('aria-label') || e.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 40)}»`;
  const y = (e) => Math.round(e.getBoundingClientRect().top + scrollY);
  // 1. Text überlappt anderen Text
  const leaf = [...document.querySelectorAll('h1,h2,h3,h4,h5,p,li,a,button,label,figcaption,dt,dd,th,td,summary,blockquote,small,strong,span')].filter((e) => vis(e) && e.textContent.trim() && ![...e.children].some((c) => c.textContent.trim() && getComputedStyle(c).display !== 'inline'));
  // klebende/feste Leisten liegen absichtlich über dem Inhalt: beim Überlappungstest auslassen
  const floating = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'sticky' || p === 'fixed') return true; } return false; };
  // Glyphen-Rechtecke des Textes (nicht die Box mit Innenabstand): Padding/Trefferflächen sind keine Überlappung
  const textRects = (e) => { const r = document.createRange(); r.selectNodeContents(e); return [...r.getClientRects()].filter((q) => q.width > 1 && q.height > 1); };
  const rects = leaf.filter((e) => !floating(e)).map((e) => ({ e, rs: textRects(e) }));
  let ov = 0;
  for (let i = 0; i < rects.length && ov < 8; i++) for (let j = i + 1; j < rects.length && ov < 8; j++) {
    const a = rects[i], b = rects[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    for (const ra of a.rs) for (const rb of b.rs) { const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top); if (ix > 4 && iy > 4 && ix * iy > 0.15 * Math.min(ra.width * ra.height, rb.width * rb.height)) { out.push(`текст налезает на текст: ${name(a.e)} и ${name(b.e)} (y ${y(a.e)})`); ov++; break; } }
  }
  // 2. Zielgröße für Finger (nur Telefon; Links im Fließtext ausgenommen)
  if (phone) { let n = 0; document.querySelectorAll('a,button,summary,input:not([type=hidden]),select,[role=button]').forEach((e) => { if (n > 8 || !vis(e)) return; const r = e.getBoundingClientRect(); const inText = e.tagName === 'A' && e.closest('p,li,dd,td,small,label') && e.parentElement.textContent.trim().length > e.textContent.trim().length + 3; if (inText || e.type === 'checkbox' || e.type === 'radio') return; let hit = r; const after = getComputedStyle(e, '::after'); if (after.content !== 'none' && after.position === 'absolute') { const px = (v) => (parseFloat(v) || 0); hit = { height: r.height - Math.min(0, px(after.top)) - Math.min(0, px(after.bottom)), width: r.width - Math.min(0, px(after.left)) - Math.min(0, px(after.right)) }; } if (hit.height < 40 || hit.width < 40) { out.push(`маленькая зона нажатия ${Math.round(r.width)}×${Math.round(r.height)}: ${name(e)} (y ${y(e)})`); n++; } }); }
  // 3. Kontrast (WCAG): Textfarbe gegen tatsächlichen Hintergrund
  // beliebige CSS-Farbe (auch oklch/color-mix) über ein 1×1-Canvas in RGBA umrechnen
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1; const cx = cvs.getContext('2d', { willReadFrequently: true }); const cache = new Map();
  const rgb = (c) => { if (cache.has(c)) return cache.get(c); cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; const v = [d[0], d[1], d[2], d[3] / 255]; cache.set(c, v); return v; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (e) => { let n = e; const stack = []; while (n && n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.backgroundImage !== 'none' || cs.mixBlendMode !== 'normal') return null; const c = rgb(cs.backgroundColor); if ((c[3] ?? 1) > 0) { stack.push(c); if ((c[3] ?? 1) >= 0.99) break; } n = n.parentElement; } let base = [255, 255, 255]; for (const c of stack.reverse()) { const a = c[3] ?? 1; base = base.map((v, i) => v * (1 - a) + c[i] * a); } return base; };
  let nc = 0;
  for (const e of leaf) { if (nc > 8) break; const cs = getComputedStyle(e); if (e.closest('svg,video,canvas,picture')) continue; const bg = bgOf(e); if (!bg) continue; const fg = rgb(cs.color); const a = fg[3] ?? 1; const f = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a) * (+cs.opacity < 1 ? 1 : 1)); const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) * 1; const op = (() => { let o = 1, n = e; while (n && n.nodeType === 1) { o *= +getComputedStyle(n).opacity; n = n.parentElement; } return o; })(); const eff = op < 1 ? 1 + (ratio - 1) * op : ratio; const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700); const need = big ? 3 : 4.5; if (eff < need && !e.disabled && !e.closest(':disabled')) { out.push(`слабый контраст ${eff.toFixed(1)}:1 (нужно ${need}): ${name(e)} (y ${y(e)})`); nc++; } }
  // 4. Schriftgröße
  let nf = 0; for (const e of leaf) { if (nf > 5) break; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < (phone ? 12 : 11)) { out.push(`мелкий шрифт ${fs}px: ${name(e)} (y ${y(e)})`); nf++; } }
  if (phone) document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea').forEach((e) => { if (vis(e) && parseFloat(getComputedStyle(e).fontSize) < 16) out.push(`поле ввода со шрифтом < 16px (iPhone увеличит страницу при касании): ${name(e)}`); });
  // 5. Bilder: kaputt, ohne alt, unscharf (auf 2x-Bildschirmen)
  document.querySelectorAll('img').forEach((im) => { if (!vis(im)) return; if (im.complete && !im.naturalWidth) out.push(`картинка не загрузилась: ${im.getAttribute('src')}`); if (!im.hasAttribute('alt')) out.push(`картинка без alt: ${im.getAttribute('src')}`); const r = im.getBoundingClientRect(); const fit = getComputedStyle(im).objectFit; const need = (fit === 'cover' ? Math.max(r.width / im.naturalWidth, r.height / im.naturalHeight) : r.width / im.naturalWidth) * 2; if (im.naturalWidth && need > 1.6 && !/\.svg/.test(im.currentSrc)) out.push(`картинка будет мутной на телефоне (показано ${Math.round(r.width)}px, файл ${im.naturalWidth}px): ${im.getAttribute('src')}`); });
  // 6. Überschriften
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => !h.closest('[hidden]'));
  const h1 = hs.filter((h) => h.tagName === 'H1').length; if (h1 !== 1) out.push(`заголовков h1 на странице: ${h1} (нужен ровно один)`);
  let prev = 1; hs.forEach((h) => { const l = +h.tagName[1]; if (l > prev + 1) out.push(`пропущен уровень заголовка: ${h.tagName.toLowerCase()} после h${prev} ${name(h)}`); prev = l; });
  // 7. Sticky/fixed Elemente verdecken Inhalt beim Laden? (feste Leisten höher als 25 % des Bildschirms)
  document.querySelectorAll('body *').forEach((e) => { const cs = getComputedStyle(e); if ((cs.position === 'fixed' || cs.position === 'sticky') && vis(e)) { const r = e.getBoundingClientRect(); if (cs.position === 'fixed' && r.height > innerHeight * 0.25 && r.width > innerWidth * 0.8) out.push(`фиксированный блок закрывает ${Math.round(100 * r.height / innerHeight)} % экрана: ${name(e)}`); } });
  return [...new Set(out)];
};

// Logik nur für «после»
async function logic(p) {
  const res = [];
  for (const [W, H] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: W < 900, hasTouch: W < 900 });
    const page = await ctx.newPage();
    // Layout-Sprünge (CLS) während der ersten 10 s mit echter Bewegung: Hero-Film, Animationen, nachladende Bilder/Schriften
    await page.addInitScript(() => { window.__shifts = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.hadRecentInput) return; window.__shifts.push({ t: Math.round(e.startTime), v: e.value, src: (e.sources || []).map((s) => { const n = s.node; return n && n.nodeType === 1 ? `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : n.classList[0] ? '.' + n.classList[0] : ''} y ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}` : ''; }).filter(Boolean) }); })).observe({ type: 'layout-shift', buffered: true }); });
    await page.goto(A.url + p, { waitUntil: 'load' }); await page.waitForTimeout(10000);
    const shifts = await page.evaluate(() => window.__shifts);
    const cls = shifts.reduce((a, e) => a + e.v, 0);
    if (cls > 0.01) res.push(`${W}px: прыгает вёрстка (CLS ${cls.toFixed(3)}): ` + shifts.filter((e) => e.v > 0.001).slice(0, 4).map((e) => `${(e.t / 1000).toFixed(1)} с: ${e.src.slice(0, 3).join(', ')}`).join(' | '));
    const r = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('a[href^="#"]').forEach((a) => { const id = decodeURIComponent(a.getAttribute('href').slice(1)); if (id && !document.getElementById(id)) bad.push(`якорь без цели: ${a.getAttribute('href')} («${a.textContent.trim().slice(0, 30)}»)`); });
      document.querySelectorAll('a,button,input,select,textarea,summary').forEach((e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') return; if (r.right > innerWidth + 0.5 || r.left < -0.5) { let n = e.parentElement, inScroller = false; while (n && n !== document.body) { if (getComputedStyle(n).overflowX !== 'visible') { inScroller = true; break; } n = n.parentElement; } if (!inScroller) bad.push(`за краем экрана: «${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30)}» ${Math.round(r.left)}..${Math.round(r.right)}`); } });
      document.querySelectorAll('h1,h2,h3,p,li,span,div,td,th,label,button,a').forEach((e) => { if (e.clientWidth && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && getComputedStyle(e).textOverflow !== 'ellipsis' && !/scroll|auto/.test(getComputedStyle(e).overflowX)) bad.push(`обрезан текст: ${e.tagName.toLowerCase()}.${e.classList[0] || ''} «${e.textContent.trim().slice(0, 30)}»`); });
      if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(`горизонтальная прокрутка страницы: ${document.documentElement.scrollWidth} > ${innerWidth}`);
      document.querySelectorAll('form a[href*="datenschutz"],form a[href*="impressum"]').forEach((a) => { if (a.target !== '_blank') bad.push(`ссылка в форме откроется в той же вкладке (данные пропадут): ${a.getAttribute('href')}`); });
      const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && !/^(#|https?:|mailto:|tel:|javascript:)/.test(h));
      return { bad, links };
    });
    r.bad.forEach((b) => res.push(`${W}px: ${b}`));
    // interne Links prüfen
    for (const h of [...new Set(r.links)]) {
      const u = new URL(h, A.url + p); const f = path.join(out, 'after', decodeURIComponent(u.pathname));
      const ok = fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html')));
      if (!ok) res.push(`битая ссылка: ${h}`);
    }
    // Formulare: ausfüllen, neu laden, Daten noch da?
    // nur Formulare mit Kontaktdaten (Name/E-Mail/Telefon): dort dürfen Eingaben nie verloren gehen
    if (W === 390 && await page.$('form input[type=email], form input[type=tel], form [autocomplete=name]')) {
      const filled = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('form').forEach((f) => { if (!f.querySelector('input[type=email],input[type=tel],[autocomplete=name]')) return;
        f.querySelectorAll('input[type=text], input[type=email], input[type=tel], input:not([type]), textarea').forEach((e, i) => {
          if (e.disabled || e.readOnly) return;
          const v = e.type === 'email' ? `test${i}@example.com` : e.type === 'tel' ? '0511 123456' : e.type === 'number' ? '5' : e.type === 'date' ? '2027-05-04' : `Test ${i}`;
          e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
          out.push([e.name || e.id || `#${i}`, v]);
        }); });
        return out;
      });
      await page.waitForTimeout(400); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
      const lost = await page.evaluate((filled) => filled.filter(([n, v]) => { const e = document.querySelector(`form [name="${n}"], form #${CSS.escape(n)}`); return e && e.value !== v; }).map(([n]) => n), filled);
      if (filled.length && lost.length) res.push(`форма: после перезагрузки пропали поля ${lost.join(', ')}`);
    }
    await ctx.close();
  }
  return [...new Set(res)];
}

// Pixelvergleich im Browser (ohne Zusatzpakete): Bänder mit Änderungen + Ausschnitte «до | после | разница»
const cmpPage = await (await browser.newContext()).newPage();
await cmpPage.setContent('<html><body></body></html>');
async function pixdiff(a, b, offs = [0]) {
  return cmpPage.evaluate(async ([a, b, offs]) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const W = Math.max(ia.width, ib.width), H = Math.max(ia.height, ib.height);
    const cv = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(img, 0, 0); return x.getImageData(0, 0, W, H).data; };
    const da = cv(ia), db = cv(ib); const rows = new Uint32Array(H); let total = 0;
    // Zeile «nach» y gilt als unverändert, wenn sie einer Zeile «vor» bei y - d entspricht (d = bekannte Verschiebungen):
    // so erscheint ein nach unten gerutschter Rest der Seite nicht als «alles geändert», nur die Ursache
    const rowDiff = (y, d) => { const yb = y - d; if (yb < 0 || yb >= H) return W; let n = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, j = (yb * W + x) * 4; if (Math.abs(da[i] - db[j]) + Math.abs(da[i + 1] - db[j + 1]) + Math.abs(da[i + 2] - db[j + 2]) > 40) n++; } return n; };
    const shiftOf = new Int32Array(H);
    for (let y = 0; y < H; y++) { let best = W + 1, bd = 0; for (const d of offs) { const n = rowDiff(y, d); if (n < best) { best = n; bd = d; } if (!n) break; } rows[y] = best; shiftOf[y] = bd; total += best; }
    // Bänder zusammenfassen (Lücken < 24 px zusammen)
    const bands = []; let s = -1, last = -100;
    for (let y = 0; y < H; y++) if (rows[y] > 1) { if (y - last > 24) { if (s >= 0) bands.push([s, last]); s = y; } last = y; }
    if (s >= 0) bands.push([s, last]);
    const crops = bands.slice(0, 8).map(([y0, y1]) => {
      const pad = 40, top = Math.max(0, y0 - pad), h = Math.min(H, y1 + pad) - top, hh = Math.min(h, 900);
      const c = document.createElement('canvas'); c.width = W * 3 + 20; c.height = hh; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      const topB = Math.max(0, top - shiftOf[y0]);
      x.drawImage(ib, 0, topB, W, hh, 0, 0, W, hh); x.drawImage(ia, 0, top, W, hh, W + 10, 0, W, hh);
      x.drawImage(ia, 0, top, W, hh, 2 * W + 20, 0, W, hh); x.globalAlpha = 0.25; x.fillStyle = '#fff'; x.fillRect(2 * W + 20, 0, W, hh); x.globalAlpha = 1;
      const d = x.getImageData(2 * W + 20, 0, W, hh);
      for (let yy = 0; yy < hh; yy++) { if (!rows[top + yy]) continue; const yb = top + yy - shiftOf[top + yy]; for (let xx = 0; xx < W; xx++) { const i = ((top + yy) * W + xx) * 4, k = (Math.min(H - 1, Math.max(0, yb)) * W + xx) * 4; if (Math.abs(da[i] - db[k]) + Math.abs(da[i + 1] - db[k + 1]) + Math.abs(da[i + 2] - db[k + 2]) > 40) { const j = (yy * W + xx) * 4; d.data[j] = 230; d.data[j + 1] = 30; d.data[j + 2] = 30; d.data[j + 3] = 255; } } }
      x.putImageData(d, 2 * W + 20, 0);
      return { y0, y1, png: c.toDataURL('image/png').split(',')[1] };
    });
    return { total, pct: +(100 * total / (W * H)).toFixed(3), hA: ia.height, hB: ib.height, bands, crops };
  }, [a.toString('base64'), b.toString('base64'), offs]);
}


// große leere Flächen (mehr als ein Bildschirm ohne Inhalt) im Screenshot
async function emptyGaps(png, H) {
  return cmpPage.evaluate(async ([s, H]) => {
    const i = await new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + s; });
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
    const d = x.getImageData(0, 0, i.width, i.height).data; const W = i.width; const res = []; let run = 0, start = 0;
    for (let y = 0; y < i.height; y++) { let flat = true; const o = y * W * 4; for (let xx = 0; xx < W; xx += 3) { const k = o + xx * 4; if (Math.abs(d[k] - d[o]) + Math.abs(d[k + 1] - d[o + 1]) + Math.abs(d[k + 2] - d[o + 2]) > 18) { flat = false; break; } } if (flat) { if (!run) start = y; run++; } else { if (run > H * 0.9) res.push([start, start + run]); run = 0; } }
    if (run > H * 0.9 && start > 0) res.push([start, start + run]);
    return res;
  }, [png.toString('base64'), H]);
}

// Geometrie vergleichen: was hat sich bewegt / verändert; Kaskaden (alles darunter um N px verschoben) zusammenfassen
function geodiff(gb, ga) {
  const mb = new Map(gb.items.map((e) => [e.k, e])), ma = new Map(ga.items.map((e) => [e.k, e]));
  const changed = [], gone = [], added = [];
  for (const [k, b] of mb) {
    const a = ma.get(k); if (!a) { gone.push(b); continue; }
    const d = { k, t: a.t || b.t, dx: a.x - b.x, dy: a.y - b.y, dw: a.w - b.w, dh: a.h - b.h, style: [] };
    for (const p of ['fs', 'pad', 'mar', 'col', 'bg']) if (a[p] !== b[p]) d.style.push(`${p}: ${b[p]} → ${a[p]}`);
    if (d.dx || d.dy || d.dw || d.dh || d.style.length || a.t !== b.t) changed.push({ ...d, textChanged: a.t !== b.t, y: b.y });
  }
  for (const [k, a] of ma) if (!mb.has(k)) added.push(a);
  changed.sort((p, q) => p.y - q.y);
  // Container, die nur höher/niedriger wurden, weil ein Kind sich geändert hat, nicht einzeln melden
  const inside = (o, c) => c !== o && c.bx >= o.bx && c.by >= o.by && c.bx + c.bw <= o.bx + o.bw + 1 && c.by + c.bh <= o.by + o.bh + 1;
  changed.forEach((c) => { const b = mb.get(c.k); Object.assign(c, { bx: b.x, by: b.y, bw: b.w, bh: b.h }); });
  const onlyHeight = (c) => c.dh && !c.dw && !c.dx && !c.style.length && !c.textChanged;
  for (let i = changed.length - 1; i >= 0; i--) { const c = changed[i]; if (onlyHeight(c) && changed.some((d) => d !== c && (d.dw || d.dh || d.style.length || d.textChanged) && inside(c, d))) changed.splice(i, 1); }
  // reine Verschiebung nach unten/oben ohne eigene Änderung = Folge; Ursache = erstes Element mit Größe/Stil/Text-Änderung davor
  const own = changed.filter((c) => c.dw || c.dh || c.style.length || c.textChanged || c.dx);
  const shifts = []; let cur = null;
  for (const c of changed.filter((c) => !own.includes(c) && c.dy)) {
    if (cur && cur.dy === c.dy) cur.n++; else { cur = { dy: c.dy, from: c, n: 1 }; shifts.push(cur); }
  }
  return { own, shifts, gone, added, dH: ga.H - gb.H, dW: ga.W - gb.W };
}

// ---------- 3. Обход ----------
const md = [AUDIT_ONLY ? `# Аудит ${slug} (текущая версия)` : `# Регресс ${slug}: ${ref} → рабочая папка`, '', `Страниц: ${pages.length}, экраны: ${VIEWS.map((v) => v.join('×')).join(', ')}`, ''];
let nChanged = 0, nIssues = 0;
for (const p of pages) {
  if (!pagesA.includes(p)) { md.push(`## ${p}`, '', '- **страница пропала**', ''); nChanged++; continue; }
  const lg = await logic(p);
  const sec = [];
  if (!AUDIT_ONLY && !pagesB.includes(p)) sec.push('- новая страница (сравнивать не с чем)');
  for (const v of VIEWS) {
    const tag = `${p.replace(/\//g, '_') || '_'}${v.join('x')}`.replace(/^_+/, '') || 'root';
    const a = await capture(A.url, p, v);
    a.logs.forEach((l) => lg.push(`${v[0]}px консоль: ${l}`));
    a.audit.forEach((l) => lg.push(`${v.join('×')}: ${l}`));
    (await emptyGaps(a.shot, v[1])).forEach(([y0, y1]) => lg.push(`${v.join('×')}: пустая полоса ${y1 - y0}px без содержимого (y ${y0}–${y1}), больше экрана`));
    if (!pagesB.includes(p)) continue;
    const b = await capture(B.url, p, v);
    const g = geodiff(b.geo, a.geo);
    const offs = [0, ...new Set(g.shifts.map((x) => x.dy)), ...new Set([...g.own].map((x) => x.dy).filter(Boolean))].slice(0, 6);
    const px = await pixdiff(a.shot, b.shot, offs);
    if (!px.total && !g.own.length && !g.shifts.length && !g.gone.length && !g.added.length) continue;
    nChanged++;
    const L = [`### ${v.join('×')}  (пикселей изменено ${px.pct} %, высота страницы ${g.dH >= 0 ? '+' : ''}${g.dH} px${g.dW ? `, ширина ${g.dW >= 0 ? '+' : ''}${g.dW} px` : ''})`];
    g.own.slice(0, 25).forEach((c) => L.push(`- изменился \`${c.k}\` «${c.t}»: ${[c.dx && `x ${c.dx > 0 ? '+' : ''}${c.dx}`, c.dy && `y ${c.dy > 0 ? '+' : ''}${c.dy}`, c.dw && `ширина ${c.dw > 0 ? '+' : ''}${c.dw}`, c.dh && `высота ${c.dh > 0 ? '+' : ''}${c.dh}`, c.textChanged && 'текст', ...c.style].filter(Boolean).join(', ')}`));
    if (g.own.length > 25) L.push(`- … ещё ${g.own.length - 25} элементов`);
    g.shifts.forEach((s) => L.push(`- сдвиг ${s.dy > 0 ? 'вниз' : 'вверх'} на ${Math.abs(s.dy)} px: ${s.n} элем., начиная с \`${s.from.k}\` «${s.from.t}»`));
    g.gone.slice(0, 10).forEach((e) => L.push(`- пропал \`${e.k}\` «${e.t}»`));
    g.added.slice(0, 10).forEach((e) => L.push(`- появился \`${e.k}\` «${e.t}»`));
    px.crops.forEach((c, i) => { const f = `${tag}-${i + 1}.png`; fs.writeFileSync(path.join(out, f), Buffer.from(c.png, 'base64')); L.push(`- место ${i + 1}: y ${c.y0}–${c.y1} → \`${f}\` (до | после | разница)`); });
    if (px.bands.length > 8) L.push(`- … ещё ${px.bands.length - 8} мест с изменениями`);
    sec.push(...L, '');
  }
  if (lg.length) { nIssues += new Set(lg).size; sec.unshift('**Ошибки текущей версии (аудит, независимо от прошлой):**', ...[...new Set(lg)].map((l) => `- ${l}`), ''); }
  if (sec.length) md.push(`## ${p}`, '', ...sec);
}
md.splice(3, 0, `Итог: изменений в ${nChanged} комбинациях страница×экран, проблем: ${nIssues}.`, '');
fs.writeFileSync(path.join(out, 'report.md'), md.join('\n'));
console.log(md.slice(0, 4).join('\n'));
console.log(`Отчёт: ${path.join(out, 'report.md')}`);
await browser.close(); A.s.close(); B.s.close();
