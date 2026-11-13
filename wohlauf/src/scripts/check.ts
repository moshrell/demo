// Beweglichkeits-Check: Lagesensoren des Handys als Winkelmesser. Alles bleibt im Browser.
// Rechnung über die Drehmatrix (nicht über einzelne Euler-Winkel): stabil, auch wenn das Handy hochkant steht.
import { gaugeSvg, SPECS } from './gauge';

type V3 = [number, number, number];
type Step = { test: 'nacken' | 'schulter' | 'rumpf'; side?: 'l' | 'r' };
type Result = Record<string, { l: number | null; r: number | null }>;

const root = document.querySelector<HTMLElement>('[data-check]');
if (root) {
  const T = JSON.parse(root.dataset.t!);
  const home = root.dataset.home!;
  const $ = <E extends HTMLElement>(s: string) => root.querySelector<E>(s)!;
  const screens = [...root.querySelectorAll<HTMLElement>('[data-screen]')];
  const show = (name: string) => {
    screens.forEach((s) => (s.hidden = s.dataset.screen !== name));
    const h = root.querySelector<HTMLElement>(`[data-screen="${name}"] [data-focus]`);
    h?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };
  const STEPS: Step[] = [{ test: 'nacken' }, { test: 'schulter', side: 'l' }, { test: 'schulter', side: 'r' }, { test: 'rumpf' }];
  const res: Result = { nacken: { l: null, r: null }, schulter: { l: null, r: null }, rumpf: { l: null, r: null } };
  let mode: 'sensor' | 'manual' = 'manual';
  let stepIx = 0;
  const tdef = (id: string) => T.tests.find((t: any) => t.id === id);
  const labels = (id: string) => (id === 'schulter' ? { l: T.armLeft, r: T.armRight } : { l: T.sideLeft, r: T.sideRight });
  const buzz = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch {} };

  // ---------- Sensor ----------
  const rad = Math.PI / 180;
  const axes = (a: number, b: number, g: number) => {
    const cA = Math.cos(a * rad), sA = Math.sin(a * rad), cB = Math.cos(b * rad), sB = Math.sin(b * rad), cG = Math.cos(g * rad), sG = Math.sin(g * rad);
    return {
      x: [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG] as V3,
      y: [-cB * sA, cA * cB, sB] as V3,
      z: [cG * sA * sB + cA * sG, sA * sG - cA * cG * sB, cB * cG] as V3,
    };
  };
  const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const deg = (r: number) => r / rad;

  let last: ReturnType<typeof axes> | null = null;
  let lastT = 0;
  let onSample: ((ax: ReturnType<typeof axes>, t: number) => void) | null = null;
  const onOri = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    last = axes(e.alpha, e.beta, e.gamma);
    lastT = performance.now();
    onSample?.(last, lastT);
  };
  let listening = false;
  const listen = () => { if (!listening) { window.addEventListener('deviceorientation', onOri); listening = true; } };

  async function startSensor() {
    const D = (window as any).DeviceOrientationEvent;
    const msg = $('[data-intro-msg]');
    if (!D) return goManual(T.manualAuto);
    if (typeof D.requestPermission === 'function') {
      try { if ((await D.requestPermission()) !== 'granted') return goManual(T.denied); } catch { return goManual(T.denied); }
    }
    listen();
    msg.textContent = T.holdStill;
    msg.hidden = false;
    // Erstes Sensor-Signal abwarten (höchstens 1,5 s), sonst Handregler
    let decided = false;
    const begin = () => { if (decided) return; decided = true; onSample = null; mode = 'sensor'; msg.hidden = true; stepIx = 0; runStep(); };
    if (last) return begin();
    onSample = begin;
    setTimeout(() => { if (!decided) { decided = true; onSample = null; goManual(T.manualAuto); } }, 1500);
  }
  function goManual(note?: string) {
    mode = 'manual';
    const msg = $('[data-intro-msg]');
    if (note) { msg.textContent = note; msg.hidden = false; }
    stepIx = 0;
    runStep();
  }

  // ---------- Schritte ----------
  let stopMeasure: (() => void) | null = null;
  function runStep() {
    stopMeasure?.();
    if (stepIx >= STEPS.length) return showResult();
    const st = STEPS[stepIx], d = tdef(st.test);
    $('[data-step-count]').textContent = T.step.replace('{n}', String(stepIx + 1)).replace('{m}', String(STEPS.length));
    $('[data-step-h]').textContent = st.side ? `${d.h}: ${st.side === 'l' ? T.armLeft : T.armRight}` : d.h;
    $('[data-step-how]').textContent = d.how;
    $('[data-step-do]').textContent = d.do;
    $('[data-step-ref]').textContent = d.ref;
    $('[data-manual]').hidden = mode !== 'manual';
    $('[data-sensor]').hidden = mode !== 'sensor';
    $('[data-step-next]').hidden = mode !== 'manual';
    $('[data-step-next]').textContent = stepIx === STEPS.length - 1 ? T.toResult : T.next;
    $('[data-step-after]').hidden = true;
    show('step');
    drawStep();
    if (mode === 'manual') setupManual(st);
    else { $('[data-go]').hidden = false; $('[data-meter]').hidden = true; $('[data-step-end]').textContent = d.end; }
  }
  function drawStep() {
    const st = STEPS[stepIx];
    $('[data-step-gauge]').innerHTML = gaugeSvg(SPECS[st.test], res[st.test], labels(st.test), { title: tdef(st.test).h });
  }
  function setupManual(st: Step) {
    const spec = SPECS[st.test], box = $('[data-manual]');
    $('[data-manual-q]').textContent = tdef(st.test).manualQ;
    const both = !st.side;
    (['l', 'r'] as const).forEach((s) => {
      const row = box.querySelector<HTMLElement>(`[data-row="${s}"]`)!;
      row.hidden = !both && st.side !== s;
      const inp = row.querySelector<HTMLInputElement>('input')!, out = row.querySelector<HTMLElement>('output')!;
      row.querySelector<HTMLElement>('[data-row-label]')!.textContent = labels(st.test)[s];
      inp.max = String(spec.max);
      const start = res[st.test][s] ?? Math.round((spec.ref[0] + spec.ref[1]) / 2);
      inp.value = String(start);
      const upd = () => { res[st.test][s] = Number(inp.value); out.textContent = inp.value + '°'; drawStep(); };
      inp.oninput = upd;
      if (!row.hidden) upd();
    });
  }

  function measure() {
    const st = STEPS[stepIx];
    const live = $('[data-meter]'), num = $('[data-meter-num]'), state = $('[data-meter-state]');
    $('[data-go]').hidden = true;
    live.hidden = false;
    $('[data-step-after]').hidden = true;
    num.textContent = '0°';
    state.textContent = T.holdStill;
    let zero: ReturnType<typeof axes> | null = null, zeroHead = 0, prevHead = 0, acc = 0;
    let stillSince = 0, stillRef: V3 | null = null, maxL = 0, maxR = 0, calmSince = 0, lowSince = 0, done = false;
    const head = (ax: ReturnType<typeof axes>) => Math.atan2(ax.z[1], ax.z[0]);
    const upright = (ax: ReturnType<typeof axes>) => Math.abs(ax.y[2]) > 0.8;
    const finish = () => {
      if (done) return;
      done = true;
      onSample = null;
      clearTimeout(timer);
      buzz([40, 60, 40]);
      if (st.test === 'schulter') res.schulter[st.side!] = zero ? Math.round(Math.max(maxL, maxR)) : null;
      else res[st.test] = zero ? { l: Math.round(maxL), r: Math.round(maxR) } : { l: null, r: null };
      live.hidden = true;
      drawStep();
      const after = $('[data-step-after]');
      after.hidden = false;
      $('[data-next]').textContent = stepIx === STEPS.length - 1 ? T.toResult : T.next;
      $('[data-next]').focus({ preventScroll: true });
    };
    stopMeasure = () => { done = true; onSample = null; clearTimeout(timer); };
    const timer = setTimeout(finish, 30000);
    $('[data-finish]').onclick = finish;
    onSample = (ax, t) => {
      if (done) return;
      if (!zero) {
        // Nullpunkt: Handy in Ausgangslage und 0,6 s ruhig
        const okPose = st.test === 'schulter' ? true : upright(ax); // Arm: Griff egal, nur Ruhe zählt
        const ref = st.test === 'nacken' ? ax.z : ax.y;
        if (!okPose || !stillRef || deg(Math.acos(clamp(dot(ref, stillRef), -1, 1))) > 4) { stillRef = ref; stillSince = t; return; }
        if (t - stillSince < 600) return;
        zero = ax; zeroHead = prevHead = head(ax); acc = 0;
        buzz(60);
        state.textContent = T.measuring;
        return;
      }
      let cur = 0;
      if (st.test === 'nacken') {
        if (Math.abs(ax.z[2]) < 0.75) {
          let d = head(ax) - prevHead;
          if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
          acc += d; prevHead = head(ax);
        }
        cur = deg(acc); // positiv = nach links (gegen den Uhrzeigersinn von oben)
        if (!upright(ax) && Math.abs(ax.y[2]) < 0.5) { if (!lowSince) lowSince = t; else if (t - lowSince > 350 && (maxL > 8 || maxR > 8)) return finish(); } else lowSince = 0;
      } else if (st.test === 'rumpf') {
        cur = deg(Math.asin(clamp(dot(ax.y, [zero.x[0], zero.x[1], 0]) / Math.hypot(zero.x[0], zero.x[1]), -1, 1)));
      } else {
        // Arm: Gesamtdrehung seit dem Nullpunkt (Spur der relativen Drehmatrix), unabhängig vom Griff
        cur = deg(Math.acos(clamp((dot(ax.x, zero.x) + dot(ax.y, zero.y) + dot(ax.z, zero.z) - 1) / 2, -1, 1)));
      }
      const spec = SPECS[st.test];
      if (st.test === 'schulter') { maxL = Math.min(spec.max, Math.max(maxL, cur)); maxR = maxL; }
      else { if (cur > 0) maxL = Math.min(spec.max, Math.max(maxL, cur)); else maxR = Math.min(spec.max, Math.max(maxR, -cur)); }
      num.textContent = Math.round(Math.abs(cur)) + '°';
      // Automatisches Ende: beide Seiten bewegt (oder Arm gehoben) und wieder ruhig in der Mitte
      const moved = st.test === 'schulter' ? maxL > 40 : maxL > 8 && maxR > 8;
      if (moved && Math.abs(cur) < (st.test === 'schulter' ? 15 : 6)) { if (!calmSince) calmSince = t; else if (t - calmSince > 900) finish(); } else calmSince = 0;
      if (t - lastDraw > 120) { lastDraw = t; liveDraw(st, maxL, maxR); }
    };
    let lastDraw = 0;
    if (last) onSample(last, performance.now());
  }
  function liveDraw(st: Step, l: number, r: number) {
    const v = st.test === 'schulter' ? { ...res.schulter, [st.side!]: l } : { l, r };
    $('[data-step-gauge]').innerHTML = gaugeSvg(SPECS[st.test], v as any, labels(st.test), { title: tdef(st.test).h });
  }

  // ---------- Ergebnis ----------
  function showResult() {
    stopMeasure?.();
    const list = $('[data-result-list]');
    list.innerHTML = '';
    (['nacken', 'schulter', 'rumpf'] as const).forEach((id) => {
      const v = res[id], d = tdef(id), spec = SPECS[id];
      const li = document.createElement('li');
      li.className = 'res';
      const has = v.l != null || v.r != null, both = v.l != null && v.r != null;
      const diff = both ? Math.abs(v.l! - v.r!) : 0;
      li.innerHTML = `<div class="res__g">${gaugeSvg(spec, v, labels(id), { title: d.h })}</div><div class="res__t"><h3></h3><p class="res__ref"></p><p class="res__note"></p></div>`;
      li.querySelector('h3')!.textContent = d.h;
      li.querySelector('.res__ref')!.textContent = d.ref;
      const note = li.querySelector<HTMLElement>('.res__note')!;
      note.textContent = !has ? T.skipped : !both ? '' : `${T.diff}: ${Math.round(diff)}°. ${diff >= spec.warn ? T.uneven : T.even}`;
      if (both && diff >= spec.warn) note.classList.add('is-uneven');
      list.append(li);
    });
    const any = Object.values(res).some((v) => v.l != null || v.r != null);
    const send = $('[data-send]') as HTMLAnchorElement;
    send.hidden = false;
    if (any) {
      try { localStorage.setItem('wohlauf:check', JSON.stringify({ at: new Date().toISOString(), mode, res })); sessionStorage.setItem('wohlauf:attach', '1'); } catch {}
    }
    send.href = home + '#anfrage';
    show('result');
  }

  // ---------- Bedienung ----------
  $('[data-start]').onclick = startSensor;
  $('[data-start-manual]').onclick = () => goManual();
  $('[data-go]').onclick = measure;
  $('[data-again]').onclick = () => { const st = STEPS[stepIx]; if (st.test === 'schulter') res.schulter[st.side!] = null; else res[st.test] = { l: null, r: null }; runStep(); };
  $('[data-next]').onclick = () => { stepIx++; runStep(); };
  $('[data-step-next]').onclick = () => { stepIx++; runStep(); };
  $('[data-skip]').onclick = () => { const st = STEPS[stepIx]; stopMeasure?.(); if (st.test === 'schulter') res.schulter[st.side!] = null; else res[st.test] = { l: null, r: null }; stepIx++; runStep(); };
  $('[data-restart]').onclick = () => { (Object.keys(res) as (keyof Result)[]).forEach((k) => (res[k] = { l: null, r: null })); $('[data-intro-msg]').hidden = true; show('intro'); };

  // Ohne Lagesensor-API (Rechner): Sensor-Knopf ausblenden, Handregler als Hauptweg
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!(window as any).DeviceOrientationEvent || !coarse) { $('[data-start]').hidden = true; $('[data-start-manual]').classList.add('btn--main'); $('[data-desk]').hidden = false; }
  show('intro');
}
