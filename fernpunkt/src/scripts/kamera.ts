// Kamera-Anprobe auf dem ganzen Bildschirm.
// Aufbau: das Kamerabild läuft in einem normalen <video> (immer flüssig), darüber liegt ein transparentes canvas nur mit der Fassung.
// Die Gesichtserkennung (MediaPipe, CPU) läuft getrennt davon und darf langsamer sein: dann hinkt nur die Fassung etwas nach, nie das Bild.
import { FRAMES, svg, size, type Frame, type Paint } from '../lib/frames';
import { paintFrame, pose, IDX, type Face, type Pt } from '../lib/tryon';
import { toggleMerk, isMerk, swatch, type Wahl } from '../lib/ui';

const dlg = document.querySelector<HTMLDialogElement>('[data-ka]');
if (dlg) init(dlg);

function init(dlg: HTMLDialogElement) {
  const $ = <T extends HTMLElement>(s: string) => dlg.querySelector<T>(s)!;
  const video = $<HTMLVideoElement>('[data-ka-video]'), canvas = $<HTMLCanvasElement>('[data-ka-canvas]'), ctx = canvas.getContext('2d')!;
  const ladenBox = $('[data-ka-laden]'), ring = $('[data-ka-ring]'), prozent = $('[data-ka-prozent]'), ladenText = $('[data-ka-text]');
  const fehlerBox = $('[data-ka-fehler]'), fehlerText = $('[data-ka-fehler-text]'), hinweis = $('[data-ka-hinweis]');
  const farbenEl = $('[data-ka-farben]'), reiheEl = $('[data-ka-reihe]'), merkBtn = $('[data-ka-merken]');
  const base = dlg.dataset.base || '/';
  const bytes = JSON.parse(dlg.dataset.bytes || '{}') as { wasm: number; js: number; task: number };

  let frame: Frame = FRAMES[0], paint: Paint = FRAMES[0].paints[0];
  const chosen: Record<string, string> = {};
  let landmarker: any = null, loading: Promise<void> | null = null;
  let stream: MediaStream | null = null, run = 0, raf = 0, smooth: Face | null = null;

  // ---------- Auswahl ----------
  const say = (t: string) => { hinweis.textContent = t; hinweis.hidden = !t; };
  const paintOf = (f: Frame) => f.paints.find((p) => p.id === chosen[f.id]) ?? f.paints[0];
  function renderReihe() {
    reiheEl.replaceChildren(...FRAMES.map((f) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.f = f.id; b.setAttribute('aria-label', `${f.name}, ${f.form}`);
      b.setAttribute('aria-pressed', String(f.id === frame.id)); b.innerHTML = svg(f, paintOf(f), { title: false }); return b;
    }));
  }
  function renderFarben() {
    farbenEl.replaceChildren(...frame.paints.map((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.p = p.id; b.setAttribute('aria-label', p.name);
      b.setAttribute('aria-pressed', String(p.id === paint.id)); b.style.background = swatch(p); return b;
    }));
  }
  function placeFarben() { // Farben stehen senkrecht direkt über der gewählten Fassung
    const sel = reiheEl.querySelector<HTMLElement>('[aria-pressed="true"]'); if (!sel || !dlg.open) return;
    const r = sel.getBoundingClientRect(), d = dlg.getBoundingClientRect(), w = farbenEl.offsetWidth || 44;
    farbenEl.style.left = Math.max(8, Math.min(d.width - w - 8, r.left - d.left + r.width / 2 - w / 2)) + 'px';
  }
  function renderInfo() {
    $('[data-ka-name]').textContent = frame.name;
    $('[data-ka-info]').textContent = `${paint.name} · ${frame.price} €`;
    merkBtn.setAttribute('aria-pressed', String(isMerk(frame.id, paint.id)));
    try { sessionStorage.setItem('fp:wahl', JSON.stringify({ f: frame.id, p: paint.id })); } catch {}
  }
  function select(f: Frame, p?: Paint) {
    frame = f; paint = p ?? paintOf(f); chosen[f.id] = paint.id;
    renderReihe(); renderFarben(); renderInfo(); placeFarben(); draw();
    reiheEl.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
    requestAnimationFrame(placeFarben);
  }
  reiheEl.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]'); if (b) select(FRAMES.find((f) => f.id === b.dataset.f)!); });
  reiheEl.addEventListener('scroll', placeFarben, { passive: true });
  farbenEl.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]'); if (b) select(frame, frame.paints.find((p) => p.id === b.dataset.p)!); });
  merkBtn.addEventListener('click', () => { toggleMerk(frame.id, paint.id); renderInfo(); document.dispatchEvent(new Event('fp:merk')); });
  addEventListener('resize', placeFarben);

  // ---------- Zeichnen ----------
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (smooth) paintFrame(ctx, frame, paint, pose(smooth));
  }

  // ---------- Laden mit Fortschritt ----------
  const setProg = (v: number | null, text: string) => {
    ladenText.textContent = text;
    if (v === null) { ring.setAttribute('data-warten', ''); prozent.textContent = ''; }
    else { ring.removeAttribute('data-warten'); ring.style.setProperty('--p', String(Math.max(4, Math.round(v * 100)))); prozent.textContent = Math.round(v * 100) + ' %'; }
  };
  async function fetchBytes(url: string, keep: boolean, add: (n: number) => void): Promise<Uint8Array | undefined> {
    const r = await fetch(base + url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    if (!r.body) { const b = new Uint8Array(await r.arrayBuffer()); add(b.length); return keep ? b : undefined; }
    const rd = r.body.getReader(), parts: Uint8Array[] = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; add(value.length); if (keep) parts.push(value); }
    if (!keep) return;
    const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; } return all;
  }
  function ensureLandmarker(onProg: (v: number) => void): Promise<void> {
    if (landmarker) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      let got = 0; const total = (bytes.wasm + bytes.js + bytes.task) || 1;
      const add = (n: number) => { got += n; onProg(Math.min(0.98, got / total)); };
      // wasm und js nur laden, damit sie im Browser-Cache liegen; das Modell behalten wir als Puffer
      const [, , model, vision] = await Promise.all([
        fetchBytes('mp/vision_wasm_internal.wasm', false, add), fetchBytes('mp/vision_wasm_internal.js', false, add),
        fetchBytes('mp/face_landmarker.task', true, add), import('@mediapipe/tasks-vision'),
      ]);
      onProg(1);
      const files = await vision.FilesetResolver.forVisionTasks(base + 'mp');
      landmarker = await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: model!, delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true,
      });
    })().catch((e) => { loading = null; throw e; });
    return loading;
  }

  // ---------- Öffnen / Schließen ----------
  const zustand = (z: 'laden' | 'live' | 'fehler', text = '') => {
    ladenBox.hidden = z !== 'laden'; fehlerBox.hidden = z !== 'fehler'; fehlerText.textContent = text;
    farbenEl.hidden = reiheEl.hidden = z === 'fehler'; hinweis.hidden = true;
  };
  function stop() {
    run++; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; smooth = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  async function start() {
    stop(); const my = run; smooth = null;
    zustand('laden'); setProg(null, 'Kamera wird gestartet …');
    if (!navigator.mediaDevices?.getUserMedia) { zustand('fehler', 'Dieser Browser gibt die Kamera nicht frei. Auf der Seite können Sie die Fassungen am Modell anprobieren.'); return; }
    let pct = 0;
    const show = () => {
      if (my !== run) return;
      if (pct > 0 && pct < 1) setProg(pct, 'Anprobe wird geladen, einmalig'); else if (pct >= 1) setProg(null, 'Gleich geht es los …');
    };
    const camP = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
    const lmP = ensureLandmarker((v) => { pct = v; show(); });
    camP.then(() => { if (my === run && pct === 0) setProg(null, 'Anprobe wird geladen …'); }, () => {});
    let s: MediaStream;
    try { s = await camP; } catch (err: any) {
      if (my !== run) return;
      zustand('fehler', err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
        ? 'Die Kamera ist nicht freigegeben. Erlauben Sie den Zugriff im Browser und versuchen Sie es noch einmal.'
        : 'Es wurde keine Kamera gefunden. Auf der Seite können Sie die Fassungen am Modell anprobieren.');
      return;
    }
    if (my !== run) { s.getTracks().forEach((t) => t.stop()); return; }
    stream = s;
    try { await lmP; } catch { if (my !== run) return; stop(); zustand('fehler', 'Die Anprobe ließ sich nicht laden. Prüfen Sie die Verbindung und versuchen Sie es noch einmal.'); return; }
    if (my !== run) return;
    try { video.srcObject = s; await video.play(); } catch { if (my !== run) return; stop(); zustand('fehler', 'Das Kamerabild konnte nicht gestartet werden.'); return; }
    if (my !== run) return;
    zustand('live'); placeFarben(); loop(my);
  }
  function loop(my: number) {
    let last = -1, skip = 0, lastTs = 0, lost = 0;
    const tick = () => {
      if (my !== run) return;
      try {
        if (video.readyState >= 2 && video.videoWidth && video.currentTime !== last) {
          last = video.currentTime;
          if (skip > 0) skip--; else {
            const W = video.videoWidth, H = video.videoHeight;
            if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
            const t0 = performance.now(), ts = Math.max(t0, lastTs + 1); lastTs = ts;
            let res: any = null;
            try { res = landmarker.detectForVideo(video, ts); } catch {}
            const dt = performance.now() - t0; skip = dt > 70 ? 2 : dt > 40 ? 1 : 0; // langsames Gerät: seltener erkennen, das Bild bleibt flüssig
            const lm = res?.faceLandmarks?.[0];
            if (lm) {
              const at = (i: number): Pt => [lm[i].x * W, lm[i].y * H];
              const d = res.facialTransformationMatrixes?.[0]?.data;
              const f: Face = { p168: at(IDX.p168), p33: at(IDX.p33), p133: at(IDX.p133), p362: at(IDX.p362), p263: at(IDX.p263), p127: at(IDX.p127), p356: at(IDX.p356), yaw: d ? Math.atan2(d[8], d[10]) : 0 };
              if (!smooth) smooth = f; else {
                const k = 0.55, mix = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
                smooth = { p168: mix(smooth.p168, f.p168), p33: mix(smooth.p33, f.p33), p133: mix(smooth.p133, f.p133), p362: mix(smooth.p362, f.p362), p263: mix(smooth.p263, f.p263), p127: mix(smooth.p127, f.p127), p356: mix(smooth.p356, f.p356), yaw: smooth.yaw + (f.yaw - smooth.yaw) * k };
              }
              if (lost) { lost = 0; say(''); }
              draw();
            } else {
              lost++;
              if (lost === 6) { smooth = null; draw(); }
              if (lost === 20) say('Bitte schauen Sie gerade in die Kamera.');
            }
          }
        }
      } catch {}
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function open() {
    let w: Wahl | null = null; try { w = JSON.parse(sessionStorage.getItem('fp:wahl') || 'null'); } catch {}
    const f = FRAMES.find((x) => x.id === w?.f) ?? frame;
    if (w?.f) chosen[f.id] = w.p;
    if (!dlg.open) dlg.showModal();
    select(f, f.paints.find((p) => p.id === w?.p));
    start();
  }
  function schliessen() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => {
    stop();
    document.dispatchEvent(new CustomEvent<Wahl>('fp:wahl', { detail: { f: frame.id, p: paint.id } }));
    document.dispatchEvent(new Event('fp:merk'));
  });
  $('[data-ka-zu]').addEventListener('click', schliessen);
  $('[data-ka-nochmal]').addEventListener('click', () => start());
  $('[data-ka-modell]').addEventListener('click', () => { schliessen(); document.getElementById('anprobe')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-kamera-auf]')) open(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) schliessen(); });
  addEventListener('pagehide', stop);
}
