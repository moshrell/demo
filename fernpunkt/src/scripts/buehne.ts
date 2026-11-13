// Примерка на странице: фото-модель по заранее посчитанным точкам (грузится мгновенно). Камера на весь экран — scripts/kamera.ts.
import { FRAMES, size, type Frame, type Paint } from '../lib/frames';
import { paintFrame, pose, type Face, type Pt } from '../lib/tryon';
import { readMerk, toggleMerk, swatch, type Wahl } from '../lib/ui';
import models from '../data/models.json';

document.querySelectorAll<HTMLElement>('[data-buehne]').forEach((root) => {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const canvas = $<HTMLCanvasElement>('[data-canvas]'), ctx = canvas.getContext('2d')!;
  const base = root.dataset.base || '/';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const q = new URLSearchParams(location.search);
  let frame: Frame = FRAMES.find((f) => f.id === q.get('f')) ?? FRAMES[0];
  let paint: Paint = frame.paints.find((p) => p.id === q.get('p')) ?? frame.paints[0];
  let model = models[0];
  const imgs = new Map<string, HTMLImageElement>();
  let drop = 1, raf = 0;

  // --- модель ---
  const modelFace = (): Face => {
    const px = (p: number[]): Pt => [p[0] * model.w, p[1] * model.h];
    const m = model as any;
    return { p168: px(m.p168), p33: px(m.p33), p133: px(m.p133), p362: px(m.p362), p263: px(m.p263), p127: px(m.p127), p356: px(m.p356), yaw: m.yaw };
  };
  async function image(): Promise<HTMLImageElement> {
    let im = imgs.get(model.id);
    if (!im) { im = new Image(); im.decoding = 'async'; im.src = base + model.src; imgs.set(model.id, im); }
    if (!im.complete) await new Promise((r) => { im!.onload = r; im!.onerror = r; });
    return im;
  }
  async function drawModel() {
    const cur = model, im = await image();
    if (cur !== model) return; // Modell wurde inzwischen gewechselt
    if (canvas.width !== model.w) { canvas.width = model.w; canvas.height = model.h; }
    ctx.drawImage(im, 0, 0, model.w, model.h);
    const ps = pose(modelFace());
    const e = 1 - Math.pow(1 - drop, 3);
    ctx.save(); ctx.globalAlpha = Math.min(1, e * 1.4);
    paintFrame(ctx, frame, paint, { ...ps, y: ps.y - (1 - e) * 26 * ps.s });
    ctx.restore();
  }
  function putOn() { // оправа «надевается» сверху
    cancelAnimationFrame(raf);
    if (reduce) { drop = 1; drawModel(); return; }
    const t0 = performance.now();
    const tick = (t: number) => { drop = Math.min(1, (t - t0) / 320); drawModel(); if (drop < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }

  // --- подписи и выбор ---
  const farben = $('[data-farben]');
  function renderPaints() {
    farben.replaceChildren(...frame.paints.map((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.farbe = p.id; b.setAttribute('aria-pressed', String(p.id === paint.id));
      const i = document.createElement('i'); i.style.background = swatch(p);
      b.append(i, p.name); return b;
    }));
  }
  const merkBtn = $('[data-merken]'), merkBox = $('[data-merk]'), merkText = $('[data-merk-text]');
  function renderMerk() {
    const m = readMerk();
    const has = m.some((x) => x.f === frame.id && x.p === paint.id);
    merkBtn.setAttribute('aria-pressed', String(has)); merkBtn.textContent = has ? 'Gemerkt' : 'Merken';
    merkBox.hidden = m.length === 0;
    merkText.textContent = 'Gemerkt: ' + m.map((x) => { const f = FRAMES.find((y) => y.id === x.f); const p = f?.paints.find((y) => y.id === x.p); return f ? `${f.name} (${p?.name ?? ''})` : ''; }).filter(Boolean).join(', ') + '.';
  }
  function renderInfo() {
    $('[data-name]').textContent = frame.name;
    $('[data-form]').textContent = `${frame.form}, ${frame.material}`;
    $('[data-groesse]').textContent = size(frame);
    $('[data-preis]').textContent = `${frame.price} €`;
    $('[data-notiz]').textContent = frame.note;
    root.querySelectorAll<HTMLElement>('[data-fassung]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fassung === frame.id)));
    renderPaints(); renderMerk();
    try { sessionStorage.setItem('fp:wahl', JSON.stringify({ f: frame.id, p: paint.id })); } catch {}
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const fb = t.closest<HTMLElement>('[data-fassung]');
    if (fb) { frame = FRAMES.find((f) => f.id === fb.dataset.fassung)!; paint = frame.paints[0]; renderInfo(); putOn(); fb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' }); return; }
    const cb = t.closest<HTMLElement>('[data-farbe]');
    if (cb) { paint = frame.paints.find((p) => p.id === cb.dataset.farbe)!; renderInfo(); drop = 1; drawModel(); return; }
    const mb = t.closest<HTMLElement>('[data-modell]');
    if (mb) { model = models.find((m) => m.id === mb.dataset.modell)!; root.querySelectorAll('[data-modell]').forEach((b) => b.setAttribute('aria-pressed', String(b === mb))); putOn(); return; }
    if (t.closest('[data-merken]')) { toggleMerk(frame.id, paint.id); renderMerk(); return; }
  });
  // камера на весь экран вернула выбор или что-то запомнила
  document.addEventListener('fp:wahl', ((e: CustomEvent<Wahl>) => {
    const f = FRAMES.find((x) => x.id === e.detail.f); if (!f) return;
    frame = f; paint = f.paints.find((x) => x.id === e.detail.p) ?? f.paints[0];
    renderInfo(); drop = 1; drawModel();
  }) as EventListener);
  document.addEventListener('fp:merk', renderMerk);

  renderInfo();
  drop = 1; drawModel().then(() => { root.dataset.bereit = '1'; });
  // первое «надевание», когда блок появился на экране
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); putOn(); } }, { threshold: 0.5 });
    io.observe(canvas);
  }
});
