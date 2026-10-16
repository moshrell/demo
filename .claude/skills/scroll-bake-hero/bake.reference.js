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
uniform float uP, uT;
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
  vec2 q = (vUv - .5) * s;

  float p = clamp(uP, 0., 1.);
  float e = p*p*(3.-2.*p);
  float peak = sin(3.14159 * p);

  // puff: the croissant grows as it rises
  q /= 1. + .075 * e;

  vec2 uv = q + .5;
  // heat shimmer, strongest mid-bake
  vec2 w = vec2(fbm(uv*7. + uT*.25), fbm(uv*7. - uT*.21 + 9.)) - .5;
  uv += w * .006 * peak;

  float inside = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
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

  col *= inside;
  // soft vignette + film grain
  float v = smoothstep(1.25, .3, length(vUv - .5) * 1.5);
  col *= mix(.55, 1., v);
  col += (hash(vUv * uRes + fract(uT)) - .5) * .028;
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

export function initBake(root) {
  const canvas = root.querySelector('[data-bake-canvas]');
  const fallback = root.querySelector('[data-bake-fallback]');
  const fbBaked = fallback?.querySelector('[data-fb-baked]');
  const clock = root.querySelector('[data-clock]');
  const stages = [...root.querySelectorAll('[data-stage]')];
  const hint = root.querySelector('[data-scroll-hint]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const srcA = canvas.dataset.a, srcB = canvas.dataset.b;

  let target = reduce ? 1 : 0, current = target, draw = null, raf = 0;

  const readProgress = () => {
    if (reduce) return 1;
    const r = root.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 1;
  };

  const HOURS = Number(root.dataset.hours || 48);

  function ui(p) {
    // scene progress: short hold on dough, long bake, short hold on result
    const sp = Math.min(1, Math.max(0, (p - .08) / .78));
    if (clock) clock.textContent = String(Math.round(HOURS * sp)).padStart(2, '0');
    // stage captions
    const idx = p < .3 ? 0 : p < .62 ? 1 : 2;
    stages.forEach((el, i) => el.classList.toggle('is-on', i === idx));
    if (hint) hint.style.opacity = p > .04 ? 0 : 1;
    root.style.setProperty('--sp', sp.toFixed(3));
    if (fbBaked) fbBaked.style.opacity = sp;
    return sp;
  }

  function useFallback() {
    canvas.hidden = true;
    fallback.hidden = false;
  }

  function frame(t) {
    const p = readProgress();
    target = p;
    current += (target - current) * (reduce ? 1 : .09);
    if (Math.abs(target - current) < .0004) current = target;
    const sp = ui(current);
    if (draw) draw(sp, t / 1000);
    raf = (Math.abs(target - current) > 0 || !reduce) ? requestAnimationFrame(frame) : 0;
  }

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { useFallback(); frame(0); return; }

  Promise.all([loadImage(srcA), loadImage(srcB)]).then(([ia, ib]) => {
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
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
      tex(ia, 0); tex(ib, 1);
      gl.uniform1i(gl.getUniformLocation(prog, 'uA'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uB'), 1);
      gl.uniform2f(gl.getUniformLocation(prog, 'uImg'), ia.naturalWidth, ia.naturalHeight);
      const uP = gl.getUniformLocation(prog, 'uP');
      const uT = gl.getUniformLocation(prog, 'uT');
      const uRes = gl.getUniformLocation(prog, 'uRes');

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      };
      resize();
      window.addEventListener('resize', () => { resize(); if (reduce) draw(1, 0); });

      draw = (sp, t) => {
        gl.uniform1f(uP, sp);
        gl.uniform1f(uT, t);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      root.classList.add('is-ready');
      cancelAnimationFrame(raf);
      frame(0);
    } catch (err) {
      console.warn('[bake] WebGL fallback:', err);
      useFallback();
      frame(0);
    }
  }).catch(() => { useFallback(); frame(0); });

  // pause when hero is off-screen
  const io = new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !raf) raf = requestAnimationFrame(frame);
    if (!en.isIntersecting) { cancelAnimationFrame(raf); raf = 0; }
  });
  io.observe(root);
}
