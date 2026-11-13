// Примерка: модель по заранее посчитанным точкам; в студии ещё и живая камера (MediaPipe грузится только по нажатию).
import { FRAMES, size, type Frame, type Paint } from '../lib/frames';
import { paintFrame, pose, IDX, type Face, type Pt } from '../lib/tryon';
import models from '../data/models.json';

type Merk = { f: string; p: string };
const KEY = 'fp:merk';
export const readMerk = (): Merk[] => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { return []; } };
const writeMerk = (m: Merk[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch {} };

document.querySelectorAll<HTMLElement>('[data-buehne]').forEach((root) => {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const canvas = $<HTMLCanvasElement>('[data-canvas]'), ctx = canvas.getContext('2d')!;
  const video = $<HTMLVideoElement>('[data-video]');
  const status = $('[data-status]');
  const base = root.dataset.base || '/';
  const studio = root.dataset.studio === '1';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const q = new URLSearchParams(location.search);
  let frame: Frame = FRAMES.find((f) => f.id === q.get('f')) ?? FRAMES[0];
  let paint: Paint = frame.paints.find((p) => p.id === q.get('p')) ?? frame.paints[0];
  let model = models[0];
  let mode: 'modell' | 'kamera' = 'modell';
  const imgs = new Map<string, HTMLImageElement>();
  let drop = 1, raf = 0;

  const say = (t: string) => { status.textContent = t; status.hidden = !t; };

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
    const im = await image();
    if (mode !== 'modell') return;
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
    if (mode !== 'modell') return;
    if (reduce) { drop = 1; drawModel(); return; }
    const t0 = performance.now();
    const tick = (t: number) => { drop = Math.min(1, (t - t0) / 320); drawModel(); if (drop < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }

  // --- подписи и выбор ---
  const farben = $('[data-farben]');
  function swatch(p: Paint) { return p.pattern ? 'radial-gradient(circle at 30% 30%, #d9994a 0 22%, transparent 24%), radial-gradient(circle at 70% 65%, #2b1206 0 30%, transparent 32%), #8a4a18' : `linear-gradient(135deg, ${p.rim2 ?? p.rim}, ${p.rim} 60%)`; }
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
    const w = root.querySelector<HTMLAnchorElement>('[data-weiter]');
    if (w) w.href = `${base}anprobe/?f=${frame.id}&p=${paint.id}`;
    renderPaints(); renderMerk();
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const fb = t.closest<HTMLElement>('[data-fassung]');
    if (fb) { frame = FRAMES.find((f) => f.id === fb.dataset.fassung)!; paint = frame.paints[0]; renderInfo(); putOn(); fb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' }); return; }
    const cb = t.closest<HTMLElement>('[data-farbe]');
    if (cb) { paint = frame.paints.find((p) => p.id === cb.dataset.farbe)!; renderInfo(); if (mode === 'modell') { drop = 1; drawModel(); } return; }
    const mb = t.closest<HTMLElement>('[data-modell]');
    if (mb) { if (mode === 'kamera') stopCam(); model = models.find((m) => m.id === mb.dataset.modell)!; root.querySelectorAll('[data-modell]').forEach((b) => b.setAttribute('aria-pressed', String(b === mb))); putOn(); return; }
    if (t.closest('[data-merken]')) {
      let m = readMerk(); const i = m.findIndex((x) => x.f === frame.id && x.p === paint.id);
      if (i >= 0) m.splice(i, 1); else { m.push({ f: frame.id, p: paint.id }); m = m.slice(-3); }
      writeMerk(m); renderMerk(); return;
    }
    if (t.closest('[data-kamera]')) { if (mode === 'kamera') stopCam(); else startCam(); }
  });

  // --- камера (только студия) ---
  let stream: MediaStream | null = null, landmarker: any = null, last = -1, smooth: Face | null = null, lost = 0;
  const camBtn = root.querySelector<HTMLButtonElement>('[data-kamera]');
  async function startCam() {
    if (!studio || !camBtn) return;
    if (!navigator.mediaDevices?.getUserMedia) { say('Dieser Browser gibt die Kamera hier nicht frei. Probieren Sie die Fassungen am Modell an.'); return; }
    camBtn.disabled = true; say('Kamera wird gestartet …');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
    } catch (err: any) {
      camBtn.disabled = false;
      say(err?.name === 'NotAllowedError' ? 'Die Kamera ist nicht freigegeben. Erlauben Sie den Zugriff im Browser oder probieren Sie am Modell an.' : 'Keine Kamera gefunden. Probieren Sie die Fassungen am Modell an.');
      return;
    }
    try {
      video.hidden = false; video.srcObject = stream; await video.play();
      if (!landmarker) {
        say('Anprobe wird geladen, einmalig etwa 6 MB …');
        const vision = await import('@mediapipe/tasks-vision');
        const files = await vision.FilesetResolver.forVisionTasks(base + 'mp');
        const make = (delegate: 'GPU' | 'CPU') => vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: base + 'mp/face_landmarker.task', delegate }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true });
        try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
      }
    } catch {
      stopCam(); camBtn.disabled = false; say('Die Anprobe mit Kamera ließ sich nicht laden. Probieren Sie die Fassungen am Modell an.');
      return;
    }
    mode = 'kamera'; smooth = null; lost = 0; cancelAnimationFrame(raf);
    root.dataset.live = '1'; camBtn.disabled = false; camBtn.textContent = 'Kamera ausschalten'; say('');
    canvas.setAttribute('aria-label', 'Anprobe: Ihr Kamerabild mit der gewählten Fassung');
    raf = requestAnimationFrame(loop);
  }
  function stopCam() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; video.hidden = true;
    mode = 'modell'; delete root.dataset.live; say('');
    if (camBtn) camBtn.textContent = 'Kamera einschalten';
    canvas.setAttribute('aria-label', 'Anprobe: Modell mit der gewählten Fassung');
    drop = 1; drawModel();
  }
  function loop() {
    if (mode !== 'kamera') return;
    const W = video.videoWidth, H = video.videoHeight;
    if (W && video.readyState >= 2 && video.currentTime !== last) {
      last = video.currentTime;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      let res: any = null;
      try { res = landmarker.detectForVideo(video, performance.now()); } catch {}
      ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, W, H); ctx.restore();
      const lm = res?.faceLandmarks?.[0];
      if (lm) {
        // кадр показан зеркально: x переворачиваем и меняем стороны местами
        const at = (i: number): Pt => [W - lm[i].x * W, lm[i].y * H];
        const d = res.facialTransformationMatrixes?.[0]?.data;
        const f: Face = { p168: at(IDX.p168), p33: at(IDX.p263), p133: at(IDX.p362), p362: at(IDX.p133), p263: at(IDX.p33), p127: at(IDX.p356), p356: at(IDX.p127), yaw: d ? -Math.atan2(d[8], d[10]) : 0 };
        if (!smooth) smooth = f; else {
          const k = 0.55; const mix = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
          smooth = { p168: mix(smooth.p168, f.p168), p33: mix(smooth.p33, f.p33), p133: mix(smooth.p133, f.p133), p362: mix(smooth.p362, f.p362), p263: mix(smooth.p263, f.p263), p127: mix(smooth.p127, f.p127), p356: mix(smooth.p356, f.p356), yaw: smooth.yaw + (f.yaw - smooth.yaw) * k };
        }
        paintFrame(ctx, frame, paint, pose(smooth));
        if (lost) { lost = 0; say(''); }
      } else if (++lost === 25) { smooth = null; say('Bitte schauen Sie gerade in die Kamera.'); }
    }
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'kamera') stopCam(); });
  addEventListener('pagehide', () => { if (mode === 'kamera') stopCam(); });

  renderInfo();
  drop = 1; drawModel().then(() => { root.dataset.bereit = '1'; });
  // первое «надевание», когда блок появился на экране
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); putOn(); } }, { threshold: 0.5 });
    io.observe(canvas);
  }
});
