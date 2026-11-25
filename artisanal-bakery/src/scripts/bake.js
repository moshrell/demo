// Scroll-driven "baking" scene. Two photos (raw, baked) + one fragment shader.
// No video: the browning front, puff, heat shimmer and glow are computed live.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uA, uB;
uniform float uP, uT, uZoom, uShift, uShiftX;
uniform vec2 uRes, uImg;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0., a = .5; for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return v; }

void main(){
  float ra = uRes.x / uRes.y, ri = uImg.x / uImg.y;
  // contain-fit: whole croissant always visible, black fills the rest
  vec2 s = vec2(max(1., ra/ri), max(1., ri/ra)) * 1.02;
  vec2 q = (vUv + vec2(-uShiftX, uShift) - .5) * s / uZoom;

  float p = clamp(uP, 0., 1.);
  float e = p*p*(3.-2.*p);
  float peak = sin(3.14159 * p);

  // puff: the croissant grows as it rises
  q /= 1. + .075 * e;

  vec2 uv = q + .5;
  // heat shimmer, strongest mid-bake
  vec2 w = vec2(fbm(uv*7. + uT*.25), fbm(uv*7. - uT*.21 + 9.)) - .5;
  uv += w * .006 * peak;

  float inside = smoothstep(0., .035, uv.x) * smoothstep(1., .965, uv.x) * smoothstep(0., .05, uv.y) * smoothstep(1., .86, uv.y);
  vec3 A = texture2D(uA, uv).rgb;
  vec3 B = texture2D(uB, uv).rgb;

  // browning front: starts at the ridges and spreads, ragged like real browning
  float dist = length((uv - .5) * vec2(1., .95)) * 1.55;
  float n = fbm(uv * 5.5);
  float t = n * .5 + dist * .5;
  float front = p * 1.38 - .12;
  float m = smoothstep(t - .1, t + .1, front);

  // dough warms up just ahead of the front
  float warm = smoothstep(front + .38, front, t) * (1. - m);
  vec3 a = A * mix(vec3(1.), vec3(1.16, .86, .5), warm * .85);
  vec3 col = mix(a, B, m);

  // ember glow on the front
  float edge = m * (1. - m) * 4.;
  col += vec3(1., .42, .08) * edge * .16 * (.6 + .4 * fbm(uv * 12. + uT * .6));
  // oven light rising overall
  col *= 1. + .12 * peak;
  col = mix(col, col * vec3(1.06, 1., .92), e);

  // dunkle Fotohintergruende (Verlauf im JPG) weich auf echtes Schwarz ziehen
  col *= smoothstep(.05, .14, dot(col, vec3(.333)));
  col = max(col - .04, 0.) * 1.05;
  col *= inside;
  // soft vignette + film grain
  float v = smoothstep(1.4, .4, length(vUv - .5) * 1.5);
  col *= mix(.7, 1., v);
  col += vec3(.0392); // exakt Seitenhintergrund #0A0A0A, damit keine Kante sichtbar ist
  col += (hash(vUv * uRes + fract(uT)) - .5) * .03 * smoothstep(.05, .3, dot(col, vec3(.333)));
  gl_FragColor = vec4(col, 1.);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

const IMG_W = 1376, IMG_H = 768;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function initBake(root) {
  const canvas = root.querySelector('[data-bake-canvas]');
  const box = root.querySelector('.hero__stick'); // Maße immer von der Bühne, auch wenn das Canvas gerade versteckt ist
  const fallback = root.querySelector('[data-bake-fallback]');
  const fbBaked = fallback?.querySelector('[data-fb-baked]');
  const clock = root.querySelector('[data-clock]');
  const stages = [...root.querySelectorAll('[data-stage]')];
  const callouts = [...root.querySelectorAll('[data-callout]')];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const srcA = canvas.dataset.a, srcB = canvas.dataset.b;
  const HOURS = Number(root.dataset.hours || 48);

  let target = reduce ? 1 : 0, current = target, draw = null, raf = 0;

  const readProgress = () => {
    if (reduce) return 1;
    const r = root.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    // Die letzten ~18 % der Scrollstrecke halten das fertige Bild, damit die Beschriftungen lesbar sind
    return span > 0 ? Math.min(1, Math.max(0, -r.top / span / .82)) : 1;
  };

  // Start-Zoom und Versatz: das Croissant sitzt im freien Bereich UNTER Überschrift und Buttons,
  // gemessen am echten Layout (Handy-Browserleisten, Schriftgröße, Zeilenumbrüche).
  const CR_TOP = 165, CR_BOTTOM = 640; // Croissant im Foto (px, Foto 1376 x 768)
  let viewCache = null, viewKey = '';
  const view = () => {
    const W = box.clientWidth, H = Math.max(1, box.clientHeight), ra = W / H;
    const intro = root.querySelector('.hero__intro'), cta = root.querySelector('.hero__cta');
    const ctaBottom = intro && cta ? intro.offsetTop + cta.offsetTop + cta.offsetHeight : H * .42;
    const key = [W, H, Math.round(ctaBottom)].join('x');
    if (viewCache && key === viewKey) return viewCache;
    const portrait = ra < .9, mid = ra < 1.4;
    const zmax = portrait ? 1.45 : mid ? .64 : .5;
    const gap = portrait ? 26 : 30, pad = portrait ? 24 : 28;
    const bandTop = ctaBottom + gap, bandBottom = H - pad;
    const span = (z) => toScreen(0, CR_BOTTOM, z, 0, 0, 0)[1] - toScreen(0, CR_TOP, z, 0, 0, 0)[1];
    let z = zmax;
    const avail = Math.max(60, bandBottom - bandTop);
    if (span(z) > avail) z = Math.max(.25, z * avail / span(z));
    const centre0 = (toScreen(0, CR_TOP, z, 0, 0, 0)[1] + toScreen(0, CR_BOTTOM, z, 0, 0, 0)[1]) / 2;
    const d0 = ((bandTop + bandBottom) / 2 - centre0) / H; // Verschiebung ist linear: Bildschirm-y wächst um H pro Einheit
    viewKey = key;
    viewCache = portrait ? { z0: z, d0, zMid: 1.2, xMid: 0, zEnd: 1.2 }
      : mid ? { z0: z, d0, zMid: .9, xMid: 0, zEnd: .9 }
      : { z0: z, d0, zMid: .74, xMid: .12, zEnd: .8 };
    return viewCache;
  };

  // Bildpunkt (px im Foto) -> Bildschirm-Pixel, wie im Shader gerechnet
  function toScreen(ix, iy, zoom, shift, shiftX, e) {
    const W = box.clientWidth, H = box.clientHeight;
    const ra = W / H, ri = IMG_W / IMG_H;
    const sx = Math.max(1, ra / ri) * 1.02, sy = Math.max(1, ri / ra) * 1.02;
    const qx = (ix / IMG_W - .5) * (1 + .075 * e), qy = (.5 - iy / IMG_H) * (1 + .075 * e);
    const vx = (qx * zoom) / sx + .5 + shiftX, vy = (qy * zoom) / sy + .5 - shift;
    return [vx * W, (1 - vy) * H];
  }

  function place(zoom, shift, shiftX, e) {
    const H = box.clientHeight;
    callouts.forEach((c) => {
      const [x, y] = toScreen(Number(c.dataset.ix), Number(c.dataset.iy), zoom, shift, shiftX, e);
      c.style.setProperty('--x', x.toFixed(1) + 'px');
      c.style.setProperty('--y', y.toFixed(1) + 'px');
      c.style.setProperty('--len', Math.max(40, H - y - 96).toFixed(0) + 'px');
    });
  }

  function ui(p) {
    const sp = Math.min(1, Math.max(0, (p - .1) / .74));
    const { z0, d0, zMid, xMid, zEnd } = view();
    const zIn = sstep(0, .1, p), zOut = sstep(.86, .97, p);
    const zoom = mix(mix(z0, zMid, zIn), zEnd, zOut);
    const shift = mix(d0, 0, zIn);
    const shiftX = mix(xMid * zIn, 0, zOut);
    if (clock) clock.textContent = String(Math.round(HOURS * sp)).padStart(2, '0');
    const idx = p < .1 ? -1 : p < .36 ? 0 : p < .64 ? 1 : 2;
    stages.forEach((el, i) => el.classList.toggle('is-on', i === idx && p < .86));
    root.classList.toggle('is-done', p >= .9);
    root.classList.toggle('intro-gone', p > .09);
    root.style.setProperty('--sp', sp.toFixed(3));
    root.style.setProperty('--intro', (1 - sstep(.0, .08, p)).toFixed(3));
    root.style.setProperty('--co', (sstep(.08, .14, p) * (1 - sstep(.84, .9, p))).toFixed(3));
    if (fbBaked) fbBaked.style.opacity = sp;
    fbPlace(zoom, shift, shiftX);
    if (callouts.length && p > .8) place(zoom, shift, shiftX, 1);
    return { sp, zoom, shift, shiftX };
  }

  function useFallback() { canvas.hidden = true; fallback.hidden = false; }
  const fbPlace = (zoom, shift, shiftX) => {
    if (!fallback || fallback.hidden) return;
    const W = box.clientWidth, H = box.clientHeight;
    fallback.style.transform = `translate(${(shiftX * W).toFixed(1)}px, ${(shift * H).toFixed(1)}px) scale(${(zoom / 1.02).toFixed(3)})`;
  };

  let last = 0;
  function frame(t) {
    const p = readProgress();
    target = p;
    // Ruhephase (nichts bewegt sich): nur ~30 Bilder pro Sekunde, schont Akku und GPU
    if (!reduce && Math.abs(target - current) < .0004 && t - last < 33) { raf = requestAnimationFrame(frame); return; }
    last = t;
    current += (target - current) * (reduce ? 1 : .12);
    if (Math.abs(target - current) < .0004) current = target;
    const v = ui(current);
    if (draw) draw(v.sp, t / 1000, v.zoom, v.shift, v.shiftX);
    raf = (Math.abs(target - current) > 0 || !reduce) ? requestAnimationFrame(frame) : 0;
  }

  const ctxOpts = { antialias: false, alpha: false, powerPreference: 'default' };
  const gl = canvas.getContext('webgl', ctxOpts);
  // Ohne Grafikchip (Software-Rendering, z. B. Messroboter oder sehr alte Geräte) lieber das fertige Bild statt ruckelndem Shader
  const softwareGL = (() => {
    try {
      const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return !!info && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)));
    } catch (err) { console.error('[bake] GPU-Erkennung', err); return false; }
  })();
  if (!gl || softwareGL) { useFallback(); frame(0); return; }
  let imgs = null;
  let resize = () => {};
  window.addEventListener('resize', () => { viewCache = null; resize(); if (!raf) frame(performance.now()); });

  // Alles, was am WebGL-Kontext hängt (Programm, Texturen). Wird nach einem Kontextverlust neu aufgebaut.
  function setup() {
    try {
      canvas.hidden = false; fallback.hidden = true;
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const tex = (img, unit) => {
        const tx = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      };
      const [ia, ib] = imgs;
      tex(ia, 0); tex(ib, 1);
      gl.uniform1i(gl.getUniformLocation(prog, 'uA'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uB'), 1);
      gl.uniform2f(gl.getUniformLocation(prog, 'uImg'), ia.naturalWidth, ia.naturalHeight);
      const uP = gl.getUniformLocation(prog, 'uP');
      const uT = gl.getUniformLocation(prog, 'uT');
      const uZoom = gl.getUniformLocation(prog, 'uZoom');
      const uShift = gl.getUniformLocation(prog, 'uShift');
      const uShiftX = gl.getUniformLocation(prog, 'uShiftX');
      const uRes = gl.getUniformLocation(prog, 'uRes');

      resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      };
      resize();

      draw = (sp, t, zoom, shift, shiftX) => {
        gl.uniform1f(uP, sp);
        gl.uniform1f(uT, t);
        gl.uniform1f(uZoom, zoom);
        gl.uniform1f(uShift, shift);
        gl.uniform1f(uShiftX, shiftX);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      canvas.hidden = false; fallback.hidden = true;
      root.classList.add('is-ready');
      cancelAnimationFrame(raf);
      frame(0);
    } catch (err) {
      console.warn('[bake] WebGL fallback:', err);
      useFallback();
      frame(0);
    }
  }

  // Handy: Kontext kann beim Wechsel in eine andere App verloren gehen. Dann Standbild zeigen, bei Rückkehr neu aufbauen.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); draw = null; useFallback(); });
  canvas.addEventListener('webglcontextrestored', () => { if (imgs) setup(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && gl.isContextLost()) useFallback();
    if (document.visibilityState === 'visible' && !raf) frame(performance.now());
  });

  Promise.all([loadImage(srcA), loadImage(srcB)]).then((list) => { imgs = list; setup();
  }).catch(() => { useFallback(); frame(0); });

  document.fonts?.ready.then(() => { viewCache = null; if (!raf) frame(performance.now()); });
  const io = new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !raf) raf = requestAnimationFrame(frame);
    if (!en.isIntersecting) { cancelAnimationFrame(raf); raf = 0; }
  });
  io.observe(root);
}
