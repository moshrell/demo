// Мёд в WebGL: набор фигур (скруглённые прямоугольники, конусы-нити, капли) сливается мягким минимумом (smin)
// в одну «жидкую» поверхность. Затенение: толщина по расстоянию до края (купол), закон Бера–Ламберта
// (тонкое светлое и прозрачное, толстое тёмно-янтарное), блики, свет у нижней кромки, мягкая тень.
// Один экземпляр = один canvas. Рисуется только по запросу (draw), без постоянного цикла.

export type RRect = { x: number; y: number; w: number; h: number; r: number };
export type Cap = { x0: number; y0: number; r0: number; x1: number; y1: number; r1: number };
export type Scene = { rects: RRect[]; caps: Cap[]; k?: number; shadow?: number; bright?: number };

const MAXR = 8, MAXC = 16;

const VS = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
const FS = `
precision highp float;
uniform vec2 uRes; uniform float uDpr; uniform float uK; uniform float uShadow; uniform float uBright;
uniform vec4 uR[${MAXR}]; uniform float uRr[${MAXR}]; uniform int uNR;
uniform vec4 uC[${MAXC}]; uniform vec2 uCr[${MAXC}]; uniform int uNC;
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdRR(vec2 p, vec4 r, float rad){ vec2 c = r.xy + r.zw * 0.5; vec2 q = abs(p - c) - r.zw * 0.5 + rad; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad; }
float sdCap(vec2 p, vec4 s, vec2 rr){ vec2 a = s.xy, b = s.zw; vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0); vec2 q = pa - ba * h; return sqrt(dot(q, q) + 9.0) - 3.0 - mix(rr.x, rr.y, h); }
float sdf(vec2 p){
  float d = 1e5;
  for (int i = 0; i < ${MAXR}; i++){ if (i >= uNR) break; d = smin(d, sdRR(p, uR[i], uRr[i]), uK); }
  for (int i = 0; i < ${MAXC}; i++){ if (i >= uNC) break; d = smin(d, sdCap(p, uC[i], uCr[i]), uK); }
  return d;
}
const float DEPTH = 26.0;
float height(float d){ float t = clamp(-d / DEPTH, 0.0, 1.0); return sqrt(1.0 - (1.0 - t) * (1.0 - t)) * DEPTH; }
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  float d = sdf(p);
  float shadowD = sdf(p - vec2(0.0, 6.0));
  if (d > 1.0 && shadowD > 26.0) { gl_FragColor = vec4(0.0); return; }
  float aa = clamp(0.5 - d * uDpr, 0.0, 1.0);
  vec4 outC = vec4(0.0);
  if (aa > 0.0) {
    float e = 1.25;
    float h = height(d), hx = height(sdf(p + vec2(e, 0.0))), hy = height(sdf(p + vec2(0.0, e)));
    vec3 n = normalize(vec3(h - hx, h - hy, e * 0.9));
    float T = h / DEPTH;
    // поглощение: тонкое — светлый мёд, толстое — тёмный янтарь
    vec3 trans = exp(-vec3(0.27, 0.60, 1.65) * (0.25 + 1.5 * T));
    vec3 col = trans * 1.04 * uBright;
    vec3 L = normalize(vec3(-0.42, -0.72, 0.56));
    float dif = max(dot(n, L), 0.0);
    col *= 0.78 + 0.34 * dif;
    // свет, собранный у нижней кромки (каустика)
    float cau = exp(d / 9.0) * clamp(n.y * 1.6, 0.0, 1.0);
    col += vec3(1.0, 0.78, 0.30) * cau * 0.6;
    // внутреннее свечение в середине толщи
    col += vec3(0.9, 0.55, 0.12) * smoothstep(0.35, 1.0, T) * 0.12 * uBright;
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float sp = pow(max(dot(n, H), 0.0), 110.0) * 1.5 + pow(max(dot(n, H), 0.0), 14.0) * 0.10;
    float rim = pow(1.0 - n.z, 2.5);
    col += vec3(1.0, 0.94, 0.82) * rim * 0.22;
    float a = mix(0.55, 0.9, smoothstep(0.0, 0.8, T));
    col = col * a + vec3(1.0) * sp;
    a = clamp(a + sp, 0.0, 1.0);
    outC = vec4(col, a) * aa;
  }
  float sa = uShadow * exp(-max(shadowD, 0.0) / 8.0) * smoothstep(26.0, 0.0, shadowD);
  vec4 sh = vec4(vec3(0.20, 0.09, 0.02) * sa, sa);
  gl_FragColor = outC + sh * (1.0 - outC.a);
}`;

export class HonigGL {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private dpr = 1;
  private maxDpr: number;
  w = 0; h = 0;
  ok = false;

  constructor(canvas: HTMLCanvasElement, maxDpr = 2) {
    this.canvas = canvas; this.maxDpr = maxDpr;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }) as WebGLRenderingContext | null;
    this.gl = gl;
    if (!gl) return;
    const sh = (t: number, s: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) || 'shader'); return o; };
    try {
      const pr = gl.createProgram()!;
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['uRes', 'uDpr', 'uK', 'uShadow', 'uBright', 'uR', 'uRr', 'uNR', 'uC', 'uCr', 'uNC']) this.u[n] = gl.getUniformLocation(pr, n);
      gl.clearColor(0, 0, 0, 0);
      this.ok = true;
    } catch (e) { this.ok = false; }
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, this.maxDpr);
    if (r.width === this.w && r.height === this.h && dpr === this.dpr) return;
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  draw(s: Scene) {
    const gl = this.gl; if (!gl || !this.ok) return;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const R = s.rects.slice(0, MAXR), C = s.caps.slice(0, MAXC);
    if (!R.length && !C.length) return;
    const rv = new Float32Array(MAXR * 4), rr = new Float32Array(MAXR), cv = new Float32Array(MAXC * 4), cr = new Float32Array(MAXC * 2);
    R.forEach((q, i) => { rv.set([q.x, q.y, q.w, q.h], i * 4); rr[i] = Math.min(q.r, q.h / 2, q.w / 2); });
    C.forEach((q, i) => { cv.set([q.x0, q.y0, q.x1, q.y1], i * 4); cr.set([Math.max(q.r0, 0.01), Math.max(q.r1, 0.01)], i * 2); });
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uDpr, this.dpr);
    gl.uniform1f(this.u.uK, s.k ?? 14);
    gl.uniform1f(this.u.uShadow, s.shadow ?? 0.3);
    gl.uniform1f(this.u.uBright, s.bright ?? 1);
    gl.uniform4fv(this.u.uR, rv); gl.uniform1fv(this.u.uRr, rr); gl.uniform1i(this.u.uNR, R.length);
    gl.uniform4fv(this.u.uC, cv); gl.uniform2fv(this.u.uCr, cr); gl.uniform1i(this.u.uNC, C.length);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
