// Prozedurale Wasser-Kaustik (Lichtnetz wie am Beckenboden) für den Hero.
// Eigene Formel: zwei verzerrte Sinusfelder, helle Linien an den Nulldurchgängen.
// Leicht: halbe Auflösung, max. 30 fps, Pause außerhalb des Viewports / im Hintergrund-Tab.
// Fallback: ohne WebGL oder bei reduced-motion → ein statisches Bild (bzw. CSS-Glanz).
const VS = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const FS = `precision mediump float;
uniform vec2 r;uniform float t;
float fld(vec2 p,float t){
  vec2 q=p;
  q+=0.45*vec2(sin(q.y*1.7+t*0.9),sin(q.x*1.5-t*0.8));
  q+=0.30*vec2(sin(q.y*2.9-t*1.1),sin(q.x*2.6+t*0.7));
  return sin(q.x*2.2)*sin(q.y*2.2);
}
void main(){
  vec2 uv=gl_FragCoord.xy/r.y*2.6;
  float a=fld(uv,t);
  float b=fld(uv*1.7+vec2(7.3,2.1),t*1.25);
  float l=0.04/(abs(a)+0.04)+0.55*(0.035/(abs(b)+0.035));
  l=clamp(pow(l,1.7),0.,1.);
  vec3 c=mix(vec3(0.42,0.86,0.92),vec3(1.),l*l);
  gl_FragColor=vec4(c*l,l);
}`;

export function startCaustics(canvas: HTMLCanvasElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true, powerPreference: 'low-power' });
  if (!gl) { canvas.closest('[data-hero]')?.classList.add('no-gl'); canvas.remove(); return; }
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram()!;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { canvas.closest('[data-hero]')?.classList.add('no-gl'); canvas.remove(); return; }
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(pr, 'r');
  const uT = gl.getUniformLocation(pr, 't');

  const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(uR, w, h);
  };
  const draw = (t: number) => { gl.uniform1f(uT, t); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  resize();
  new ResizeObserver(() => { resize(); if (reduced) draw(12); }).observe(canvas);
  canvas.classList.add('is-on');
  if (reduced) { draw(12); return; }

  let visible = true, raf = 0, last = 0;
  const t0 = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    draw((now - t0) / 1000 * 0.55 + 12);
  };
  const sync = () => {
    cancelAnimationFrame(raf);
    if (visible && !document.hidden) raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(canvas);
  document.addEventListener('visibilitychange', sync);
  sync();
}
