// Живая сцена: небо считается шейдером по высоте, оболочка шара раздувается по плотности воздуха,
// капсула и оболочка освещены тем же солнцем, что и небо. Одно число на входе: высота в метрах.
import * as THREE from 'three';
import { APEX, density, track } from './atmosphere';

const RP = 1500; // радиус «планеты» в км: меньше настоящего, чтобы изгиб горизонта читался на телефоне
const BR = [5.8e-3, 13.5e-3, 33.1e-3]; // рассеяние Рэлея, 1/км
const HR = 6.5; // шкала высоты атмосферы, км
const CLOUD = 2.6; // высота облачного слоя, км
const DEG = Math.PI / 180;

// По станциям (0, 1500, 5000, 11000, 18000, 22000, 25000 м):
const SUN_ELEV = [-8, -7.2, -3.2, -0.5, 3.5, 6, 8]; // градусы над истинным горизонтом
const CAM_DIST = [60, 46, 34, 36, 4.3, 32, 62];
const CAM_Y = [0.6, -3, 8.8, 2, 0.3, 2, 19.1];
const TGT_Y = [7.6, 3.5, 6, 6, -0.9, 4.2, 10.5];
const CAM_YAW = [0, 6, 14, 26, 62, 30, 0];
// широкий экран: аппарат справа и крупнее, текст слева
const CAM_DIST_W = [37, 38, 32, 34, 4.6, 30, 56];
const CAM_Y_W = [0.6, -3, 8.8, 2, 0.3, 2, 14.8];
const TGT_Y_W = [8.2, 5.5, 6, 6, -0.2, 5, 7];
const SHIFT_W = [0.2, 0.2, 0.19, 0.19, 0.2, 0.19, 0.1];
const SUN_AZ = [-6, -6, -5.5, -5.5, -40, -30, -34]; // азимут солнца относительно взгляда, градусы

const SKY_VERT = /* glsl */ `
varying vec3 vDir; varying vec2 vNdc;
uniform mat4 uProjInv; uniform mat4 uCamWorld;
void main(){
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
  vec4 v = uProjInv * vec4(position.xy, 1.0, 1.0);
  vDir = (uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz;
}`;

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*noise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
vec3 tone(vec3 c, float e){ c = 1.0 - exp(-c * e); c = pow(c, vec3(1.0/2.2)); c = mix(c, c*c*(3.0 - 2.0*c), 0.5); float l = dot(c, vec3(0.3, 0.55, 0.15)); return clamp(mix(vec3(l), c, 1.18), 0.0, 1.0); }
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir; varying vec2 vNdc;
uniform float uH, uTime, uExp, uTwi, uCurve, uLow, uGroundY;
uniform vec3 uSun, uSunCol, uAmb, uDisc, uCirrus, uCam, uSunTop;
uniform float uRed;
const vec3 LAMP = vec3(1.0, 0.7, 0.4);
const float RP = ${RP.toFixed(1)}, HR = 6.5, HM = 1.2, CL = ${CLOUD.toFixed(1)};
const vec3 BR = vec3(${BR.join(',')}); const float BM = 5e-3;
${NOISE}
float chap(float X, float h, float c){
  float q = sqrt(X + h);
  if(c >= 0.0) return q / (q*c + 1.0) * exp(-h);
  float x0 = sqrt(1.0 - c*c) * (X + h);
  return 2.0 * sqrt(x0) * exp(X - x0) - q / (1.0 - q*c) * exp(-h);
}
vec2 sph(vec3 o, vec3 d, float r){ float b = dot(o,d), c = dot(o,o) - r*r, h = b*b - c; if(h < 0.0) return vec2(-1.0); h = sqrt(h); return vec2(-b-h, -b+h); }
void main(){
  vec3 d = normalize(vDir);
  d = normalize(d + vec3(0.0, uCurve * vNdc.x * vNdc.x, 0.0)); // широкоугольный объектив: горизонт выгибается к краям
  vec3 o = vec3(0.0, RP + uH, 0.0);
  vec2 tg = sph(o, d, RP); bool hit = tg.x > 0.0;
  // оптическая толща вдоль луча: аналитически (функция Чепмена), без шагов и без полос
  float tr, tm;
  if(hit){ float cp = dot(normalize(o + d*tg.x), -d);
    tr = HR * (chap(RP/HR, 0.0, cp) - chap(RP/HR, uH/HR, -d.y));
    tm = HM * (chap(RP/HM, 0.0, cp) - chap(RP/HM, uH/HM, -d.y));
  } else { tr = HR * chap(RP/HR, uH/HR, d.y); tm = HM * chap(RP/HM, uH/HM, d.y); }
  tr = max(tr, 0.0); tm = max(tm, 0.0);
  vec3 ext = exp(-(BR*tr + BM*tm));
  float mu = dot(d, uSun);
  vec3 scatR = 1.0 - exp(-BR*tr); float scatM = 1.0 - exp(-BM*tm);
  float pm = 0.045 / pow(1.58 - 1.52*mu, 1.5);
  vec3 col = scatR * (uSunCol*(0.55 + 0.45*mu*mu) + uAmb) + scatM * (uSunCol*(0.3 + pm) + uAmb*0.6);
  float dip = acos(RP/(RP+uH));
  float el = asin(clamp(d.y, -1.0, 1.0)) + dip;
  float az = max(dot(normalize(d.xz + 1e-5), normalize(uSun.xz)), 0.0);
  // низкое солнце: свет, прошедший длинный путь у горизонта, теряет синий; сильнее всего в сторону солнца
  col *= exp(-BR * min(tr, 75.0) * uRed * (0.3 + 1.7*az*az)) * (1.0 + uRed*0.9);
  float th = acos(clamp(mu, -1.0, 1.0));
  float glow = exp(-th*70.0)*2.2 + exp(-th*22.0)*0.9 + exp(-th*6.0)*0.26; // ореол вокруг диска, как в объективе
  // заря: тёплая полоса у горизонта в сторону солнца, пока оно под горизонтом
  vec3 dawn = mix(vec3(1.0,0.36,0.12), vec3(1.0,0.72,0.42), smoothstep(0.0,0.12,el));
  col += uTwi * dawn * exp(-max(el,0.0)*11.0) * (0.25 + 0.75*pow(az, 6.0)) * (hit ? 0.0 : 1.0) * scatR.b;

  vec2 tc = sph(o, d, RP + CL); float tcl = uH > CL ? tc.x : tc.y;
  vec2 wind = vec2(uTime*0.004, uTime*0.0015);
  if(hit){
    vec3 p = o + d*tg.x; vec3 n = normalize(p);
    float land = smoothstep(0.5, 0.62, noise(p.xz*0.004 + 3.7)*0.65 + noise(p.xz*0.013)*0.35);
    vec3 base = mix(vec3(0.008,0.03,0.08), vec3(0.06,0.075,0.04), land);
    base *= mix(0.25, 1.0, smoothstep(0.0, 0.6, uH)); // на поле земля тёмная, без «карты»
    vec3 surf = base * (uSunCol*max(dot(n,uSun),0.0)*1.6 + uAmb*0.7);
    if(uH > CL && tcl > 0.0){
      vec2 cp = (o + d*tcl).xz;
      vec2 cq = cp*0.016 + wind;
      cq += 0.55 * vec2(noise(cq*1.9 + 5.2), noise(cq*1.9 - 3.1)); // погодные системы: крупные, изогнутые
      // верх облаков как рельеф: склоны к солнцу тёплые, обратные в синей тени; вдали рельеф гаснет в дымке
      float near = exp(-tcl*0.007);
      vec2 sdir = normalize(uSun.xz);
      float fine = exp(-tcl*0.022); // кучевые бугры по 1–3 км видны только вблизи
      float h0 = fbm(cq) + (fbm(cp*0.11 + wind*5.0) - 0.5) * 0.34 * near + (fbm(cp*0.55 + wind*18.0) - 0.5) * 0.26 * fine;
      float h1 = fbm(cq + sdir*0.012) + (fbm(cp*0.11 + sdir*0.09 + wind*5.0) - 0.5) * 0.34 * near + (fbm(cp*0.55 + sdir*0.3 + wind*18.0) - 0.5) * 0.26 * fine;
      float thr = mix(0.30, 0.43, smoothstep(6.0, 20.0, uH)); // вблизи сплошной слой, с высоты видны разрывы
      float dens = smoothstep(thr, thr + 0.2, h0) * smoothstep(0.0, 0.25, uH - CL);
      float slope = (h0 - h1) * mix(7.0, 14.0, near);
      float lit = smoothstep(-0.3, 0.6, slope + 0.1);
      vec3 cc = uSunTop * (0.06 + 1.5*lit) + uAmb * (0.6 + 0.5*h0);
      cc += uSunTop * pow(max(mu, 0.0), 5.0) * 0.55 * (0.4 + 0.6*lit); // дорожка света на облаках под солнцем
      // дымка до облака, а не до земли: слой лежит выше приземной мглы
      vec3 pc = o + d*tcl; float cc0 = dot(normalize(pc), -d);
      float trc = max(HR * (chap(RP/HR, CL/HR, cc0) - chap(RP/HR, uH/HR, -d.y)), 0.0);
      float tmc = max(HM * (chap(RP/HM, CL/HM, cc0) - chap(RP/HM, uH/HM, -d.y)), 0.0);
      vec3 extc = exp(-(BR*trc + BM*tmc));
      vec3 sRc = 1.0 - exp(-BR*trc); float sMc = 1.0 - exp(-BM*tmc);
      vec3 colc = sRc * (uSunCol*(0.55 + 0.45*mu*mu) + uAmb) + sMc * (uSunCol*(0.3 + pm) + uAmb*0.6);
      colc *= exp(-BR * min(trc, 75.0) * uRed * (0.3 + 1.7*az*az)) * (1.0 + uRed*0.9);
      vec3 viaCloud = colc * mix(0.7, 1.0, 1.0 - extc.r) + cc * extc;
      vec3 viaGround = col * mix(0.62, 1.0, 1.0 - ext.r) + surf * ext;
      col = mix(viaGround, viaCloud, dens) + uDisc * glow * 0.3;
    } else {
      col = col * mix(0.62, 1.0, 1.0 - ext.r) + surf * ext + uDisc * glow * 0.3;
    }
    if(uLow > 0.0){
      // стартовое поле: вереск, туман в низинах, прожекторы и разметка площадки под капсулой
      float tp = (uGroundY - uCam.y) / min(d.y, -1e-4);
      vec2 P = uCam.xz + d.xz * tp; float r = length(P);
      float patchy = noise(P*0.07)*0.6 + noise(P*0.4)*0.4;
      vec3 skyLight = uAmb*2.0 + uSunCol*0.6;
      // с высоты: лес темнее, поля светлее, в низинах туман, река отражает небо
      float wood = smoothstep(0.45, 0.6, noise(P*0.011 + 2.0)*0.7 + noise(P*0.045)*0.3);
      vec3 heath = (mix(vec3(0.05, 0.055, 0.045), vec3(0.014, 0.022, 0.02), wood) + 0.02*patchy) * skyLight;
      vec3 mistC = uAmb*1.5 + uTwi*vec3(0.42, 0.24, 0.22) + uSunCol*0.5;
      float pool = smoothstep(0.4, 0.8, noise(P*0.006 + 7.0)*0.75 + noise(P*0.03)*0.25);
      heath = mix(heath, mistC*0.5, pool*0.75);
      float river = smoothstep(0.022, 0.006, abs(noise(P*0.0028 + 11.0) - 0.5)) * smoothstep(8.0, 30.0, r);
      heath = mix(heath, (scatR*(uSunCol*0.6 + uAmb) + uTwi*dawn*0.5)*1.1 + uCirrus*0.12, river*0.85);
      float padGlow = exp(-r*r/7.0)*1.5 + exp(-r*r/140.0)*0.22;
      float ring = smoothstep(0.07, 0.0, abs(r - 2.3)) + smoothstep(0.05, 0.0, abs(r - 0.9))*0.6;
      heath += LAMP * (padGlow*(0.35 + 0.5*patchy) + ring*(0.25 + padGlow));
      float far = 1.0 - exp(-tp*0.0011);
      vec3 hz = scatR*(uSunCol*0.6 + uAmb) + uTwi*dawn*(0.25 + 0.75*pow(az, 6.0))*scatR.b*0.75 + mistC*0.12;
      col = mix(col, mix(heath, hz, far), uLow);
    }
  } else {
    if(uH < 8.5){
      // перистые облака на 9 км: на заре они уже в солнце, когда поле ещё в тени
      float tt = sph(o, d, RP + 9.0).y; vec2 q = (o + d*tt).xz*vec2(0.011, 0.042) + wind*0.6;
      q += 0.45 * vec2(noise(q*2.0 + 1.7), noise(q*2.0 - 8.3));
      float f = fbm(q);
      f = f*0.75 + noise(q*7.0 + 3.0)*0.25;
      float dens = smoothstep(0.52, 0.8, f) * 0.46 * exp(-tt*0.016) * smoothstep(8.5, 6.0, uH);
      col = mix(col, uCirrus*(0.55 + 0.7*f), dens);
    }
    if(uLow > 0.0){
      vec3 mistC = uAmb*1.5 + uTwi*vec3(0.42, 0.24, 0.22) + uSunCol*0.5;
      col += mistC * exp(-max(el, 0.0)*60.0) * 0.16 * uLow;
      // дальние гряды: два силуэта, ближний темнее
      float azr = atan(d.z, d.x); float sink = uLow / (1.0 + uH*6.0);
      float r1 = (0.010 + 0.018*noise(vec2(azr*8.0, 1.3)) + 0.004*noise(vec2(azr*55.0, 4.0))) * sink;
      float r2 = (0.003 + 0.010*noise(vec2(azr*15.0, 9.1)) + 0.0028*noise(vec2(azr*170.0, 2.0))) * sink;
      vec3 dark = vec3(0.016, 0.018, 0.024) * (uAmb.b*3.0 + 0.25);
      col = mix(col, mix(dark, col, 0.62), smoothstep(r1, r1 - 0.0012, el));
      col = mix(col, mix(dark, col, 0.3), smoothstep(r2, r2 - 0.0010, el));
    }
    if(uH <= CL && tcl > 0.0){
      vec2 cq = (o + d*tcl).xz*0.045 + wind;
      float dens = smoothstep(0.40, 0.72, fbm(cq)) * exp(-tcl*0.03);
      vec3 cc = uAmb*0.9 + uSunCol*0.35 + uTwi*vec3(0.5,0.22,0.12)*pow(az,3.0);
      col = mix(col, cc, dens*0.85);
    }
    float lum = dot(col, vec3(0.3,0.5,0.2));
    vec3 sd = d*190.0; vec3 cell = floor(sd); vec3 f = fract(sd) - 0.5;
    float hsh = hash(cell.xy + cell.z*17.31);
    float star = step(0.992, hsh) * smoothstep(0.42, 0.0, length(f)) * (0.4 + 0.6*hash(cell.yz));
    col += star * 0.8 * clamp(1.0 - lum*16.0, 0.0, 1.0) * smoothstep(-0.02, 0.2, el);
    col += uDisc * (smoothstep(0.0082, 0.0046, th)*30.0 + glow);
  }
  col = tone(col, uExp);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const OBJ_VERT = /* glsl */ `
attribute float aInfl;
varying vec3 vN, vW; varying vec2 vUv; varying float vInfl, vY;
void main(){
  vUv = uv; vInfl = aInfl; vY = position.y;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const LIGHT = /* glsl */ `
uniform vec3 uSun, uSunCol, uSky, uGround, uRim, uCirrus; uniform float uExp, uFog, uLow; uniform vec3 uFogCol;
const vec3 LAMP = vec3(1.0, 0.7, 0.4);
vec3 envAt(vec3 r){ return mix(uGround, uSky, smoothstep(-0.25, 0.3, r.y)) + uRim * exp(-abs(r.y + 0.12)*9.0); }
`;

const FILM_FRAG = /* glsl */ `
precision highp float;
varying vec3 vN, vW; varying vec2 vUv; varying float vInfl;
${LIGHT}
${NOISE}
void main(){
  vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  float g = fract(vUv.x * 44.0);
  float seam = 1.0 - smoothstep(0.0, 0.05, min(g, 1.0 - g));
  vec3 T = normalize(cross(vec3(0.0,1.0,0.0), N) + 1e-4);
  N = normalize(N + T * (g - 0.5) * 0.55 * vInfl);
  float wr = (noise(vec2(vUv.x*90.0, vUv.y*7.0)) - 0.5) * (1.0 - vInfl);
  N = normalize(N + T * wr * 1.6);
  float nv = abs(dot(N, V));
  float fres = pow(1.0 - nv, 2.2);
  float nl = dot(N, uSun);
  float lit = max(nl, 0.0), thru = max(-nl, 0.0) * mix(0.2, 1.0, vInfl); // сложенная плёнка почти не просвечивает
  vec3 film = vec3(0.93, 0.95, 1.0);
  vec3 col = film * (envAt(N)*0.55 + uSunCol*(lit*0.55 + thru*0.95));
  col += envAt(reflect(-V, N)) * fres * 0.9;
  col += uSunCol * pow(max(dot(reflect(-uSun, N), V), 0.0), 70.0) * 1.4;
  // у земли: прожекторы снизу и первый свет на макушке
  col += film * LAMP * uLow * (0.25 + 0.75*max(-N.y, 0.0) + 0.3*fres) * (0.12 + 1.5*exp(-vW.y*0.2));
  col += film * uCirrus * uLow * 0.5 * smoothstep(5.0, 16.0, vW.y) * (0.35 + 0.65*fres + 0.5*thru);
  col *= 1.0 - seam * 0.28;
  float a = mix(0.20, 0.92, fres);
  a = mix(max(a, 0.86), a, vInfl);
  a = min(1.0, a + seam*0.22 + thru*0.18);
  col = tone(col, uExp);
  col = mix(col, uFogCol, uFog);
  gl_FragColor = vec4(col, a);
}`;

const HULL_FRAG = /* glsl */ `
precision highp float;
varying vec3 vN, vW; varying float vY;
uniform vec3 uBase; uniform float uGloss, uGlass, uGlow;
${LIGHT}
${NOISE}
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
  vec3 R = reflect(-V, N);
  float f = pow(1.0 - max(dot(N,V), 0.0), 5.0);
  float spec = pow(max(dot(R, uSun), 0.0), mix(24.0, 420.0, uGloss));
  vec3 col;
  if(uGlass > 0.5){
    vec3 lamp = vec3(1.0, 0.62, 0.30) * uGlow * (0.35 + 0.65*smoothstep(0.2, -0.16, vY));
    col = lamp * (1.0 - f) + vec3(0.004,0.006,0.01) + envAt(R) * (0.1 + 0.9*f) + uSunCol*spec*3.0;
  } else {
    vec3 hemi = mix(uGround, uSky, N.y*0.5 + 0.5);
    col = uBase * (hemi*0.8 + uSunCol*max(dot(N,uSun),0.0) + LAMP*uLow*(0.25 + 0.9*max(-N.y*0.6 + 0.4, 0.0))) + envAt(R)*(0.04 + f*0.6)*uGloss + uSunCol*spec*uGloss;
  }
  col = tone(col, uExp);
  col = mix(col, uFogCol, uFog);
  gl_FragColor = vec4(col, 1.0);
}`;

const FOG_FRAG = /* glsl */ `
precision highp float; uniform vec3 uFogCol; uniform float uFog;
void main(){ gl_FragColor = vec4(uFogCol, uFog); }`;

export interface SceneState { alt: number; yaw: number; }

export function initScene(canvas: HTMLCanvasElement, state: () => SceneState, still: boolean): boolean {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return false;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);

  // общие для всех материалов величины света
  const light = {
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Vector3() },
    uSky: { value: new THREE.Vector3() }, uGround: { value: new THREE.Vector3() }, uRim: { value: new THREE.Vector3() },
    uExp: { value: 1.25 }, uFog: { value: 0 }, uFogCol: { value: new THREE.Vector3() }, uLow: { value: 1 }, uCirrus: { value: new THREE.Vector3() },
  };

  // небо
  const skyU = {
    uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uH: { value: 0 }, uTime: { value: 0 }, uExp: light.uExp, uTwi: { value: 0 }, uCurve: { value: 0 },
    uSun: light.uSun, uSunCol: light.uSunCol, uAmb: { value: new THREE.Vector3() }, uDisc: { value: new THREE.Vector3() },
    uLow: light.uLow, uCirrus: light.uCirrus, uCam: { value: new THREE.Vector3() }, uGroundY: { value: 0 },
    uSunTop: { value: new THREE.Vector3() }, uRed: { value: 0 },
  };
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const sky = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, depthTest: false, depthWrite: false }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  // ── аппарат ────────────────────────────────────────────────────────────────
  const craft = new THREE.Group(); scene.add(craft);
  const hull = (base: number[], gloss: number, glass = 0) => new THREE.ShaderMaterial({
    vertexShader: OBJ_VERT, fragmentShader: HULL_FRAG,
    uniforms: { ...light, uBase: { value: new THREE.Vector3(...base) }, uGloss: { value: gloss }, uGlass: { value: glass }, uGlow: glowU },
  });
  const glowU = { value: 1 };
  const shell = hull([0.86, 0.87, 0.9], 0.75), metal = hull([0.2, 0.21, 0.23], 0.9), dark = hull([0.03, 0.032, 0.036], 0.4), glassM = hull([0, 0, 0], 1, 1);
  const lathe = (pts: number[][], m: THREE.Material) => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 96);
    const mesh = new THREE.Mesh(g, m); capsule.add(mesh); return mesh;
  };
  const capsule = new THREE.Group(); craft.add(capsule);
  lathe([[0, -0.345], [0.12, -0.34], [0.26, -0.315], [0.38, -0.265], [0.46, -0.2], [0.5, -0.13]], shell);
  lathe([[0.5, -0.13], [0.515, -0.06], [0.52, 0.02], [0.515, 0.1], [0.5, 0.17]], glassM);
  lathe([[0.5, 0.17], [0.46, 0.235], [0.38, 0.29], [0.26, 0.33], [0.13, 0.35], [0, 0.355]], shell);
  const ring = (r: number, y: number, t: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 96), m); o.rotation.x = Math.PI / 2; o.position.y = y; capsule.add(o); };
  ring(0.503, -0.13, 0.011, metal); ring(0.503, 0.17, 0.011, metal); ring(0.3, -0.42, 0.014, metal); ring(0.11, 0.39, 0.012, metal);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.3, 0.018), dark);
    m.position.set(Math.sin(a) * 0.516, 0.02, Math.cos(a) * 0.516); m.rotation.y = a; capsule.add(m);
  }
  const strut = (a: THREE.Vector3, b: THREE.Vector3, t: number, m: THREE.Material, parent: THREE.Object3D = capsule) => {
    const len = a.distanceTo(b);
    const o = new THREE.Mesh(new THREE.CylinderGeometry(t, t, len, 6), m);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); parent.add(o);
  };
  const BASE_Y = 1.7; // нижняя точка оболочки
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4, s = Math.sin(a), c = Math.cos(a);
    strut(new THREE.Vector3(s * 0.36, -0.28, c * 0.36), new THREE.Vector3(s * 0.3, -0.42, c * 0.3), 0.009, metal);
    strut(new THREE.Vector3(s * 0.11, 0.39, c * 0.11), new THREE.Vector3(s * 0.2, 0.31, c * 0.2), 0.007, metal);
    strut(new THREE.Vector3(s * 0.11, 0.39, c * 0.11), new THREE.Vector3(0, 1.02, 0), 0.004, dark, craft);
  }
  const pack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 24), shell); pack.position.y = 1.17; craft.add(pack); // контейнер парафойла
  strut(new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(0, BASE_Y, 0), 0.005, dark, craft);

  // оболочка: сетка «меридиан × высота», форма пересчитывается по заполнению гелием
  const NT = 72, NS = 110, GORE = 14, RMAX = 4.4;
  const pos = new Float32Array((NT + 1) * (NS + 1) * 3), uvs = new Float32Array((NT + 1) * (NS + 1) * 2), infl = new Float32Array((NT + 1) * (NS + 1));
  const idx: number[] = [];
  for (let j = 0; j < NS; j++) for (let i = 0; i < NT; i++) {
    const a = j * (NT + 1) + i, b = a + 1, c = a + NT + 1, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  for (let j = 0; j <= NS; j++) for (let i = 0; i <= NT; i++) { const k = j * (NT + 1) + i; uvs[k * 2] = i / NT; uvs[k * 2 + 1] = j / NS; }
  const env = new THREE.BufferGeometry();
  env.setAttribute('position', new THREE.BufferAttribute(pos, 3)); env.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  env.setAttribute('aInfl', new THREE.BufferAttribute(infl, 1)); env.setIndex(idx);
  const rad = new Float32Array(NS + 1), hgt = new Float32Array(NS + 1);
  let shaped = -1, top = 0;
  function shape(q: number) {
    if (Math.abs(q - shaped) < 0.002) return; shaped = q;
    const s0 = 1 - q, rb = RMAX * Math.pow(q, 0.9);
    let y = 0;
    for (let j = 0; j <= NS; j++) {
      const s = j / NS, u = Math.max(0, (s - s0) / q);
      const neck = (0.05 + 0.1 * s) * (1 - u), ri = u > 0 ? rb * Math.sin(Math.PI * Math.pow(u, 1.25)) : 0;
      rad[j] = Math.hypot(neck, ri);
      if (j > 0) { const dr = rad[j] - rad[j - 1], ds = GORE / NS; y += Math.sqrt(Math.max(ds * ds * 0.0025, ds * ds - dr * dr)); }
      hgt[j] = y;
      const k0 = j * (NT + 1), fl = ri / (ri + 0.35);
      for (let i = 0; i <= NT; i++) {
        const a = i / NT * Math.PI * 2, k = k0 + i;
        pos[k * 3] = Math.sin(a) * rad[j]; pos[k * 3 + 1] = BASE_Y + y; pos[k * 3 + 2] = Math.cos(a) * rad[j]; infl[k] = fl;
      }
    }
    top = BASE_Y + y;
    env.attributes.position.needsUpdate = true; env.attributes.aInfl.needsUpdate = true;
    env.computeVertexNormals();
    // шов сетки: первая и последняя вершины кольца совпадают, выравниваем нормали
    const n = env.attributes.normal.array as Float32Array;
    for (let j = 0; j <= NS; j++) { const a = j * (NT + 1) * 3, b = a + NT * 3; for (let c = 0; c < 3; c++) { const v = (n[a + c] + n[b + c]) / 2; n[a + c] = v; n[b + c] = v; } }
    env.computeBoundingSphere();
  }
  const film = (side: THREE.Side) => new THREE.ShaderMaterial({ vertexShader: OBJ_VERT, fragmentShader: FILM_FRAG, uniforms: light, transparent: true, depthWrite: false, side });
  const back = new THREE.Mesh(env, film(THREE.BackSide)); back.renderOrder = 1; back.frustumCulled = false; craft.add(back);
  const front = new THREE.Mesh(env, film(THREE.FrontSide)); front.renderOrder = 2; front.frustumCulled = false; craft.add(front);

  // проблесковый маяк под капсулой
  const dot = document.createElement('canvas'); dot.width = dot.height = 64;
  const g2 = dot.getContext('2d')!; const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(dot), color: 0xff3524, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  beacon.position.set(0, -0.47, 0); beacon.renderOrder = 3; craft.add(beacon);

  const fog = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FOG_FRAG, uniforms: light, transparent: true, depthTest: false, depthWrite: false }));
  fog.frustumCulled = false; fog.renderOrder = 10; scene.add(fog);

  // ── кадр ───────────────────────────────────────────────────────────────────
  const tgt = new THREE.Vector3();
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // широкий экран: то же поле зрения по короткой стороне, чтобы шар не становился гигантским
    camera.fov = w > h ? 2 * Math.atan(Math.tan(20 * DEG) * Math.min(1, h / w * 1.25)) / DEG : 40;
    wide = w / h > 1.15; vw = w; vh = h;
    camera.updateProjectionMatrix();
  }
  let wide = false, vw = 1, vh = 1;
  window.addEventListener('resize', resize); resize();

  const set = (u: { value: THREE.Vector3 }, r: number, g: number, b: number) => u.value.set(r, g, b);
  let last = performance.now(), acc = 0, frames = 0, t = 0, shown = false;

  function frame(now: number) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dtm = now - last; last = now;
    if (!still) t += Math.min(dtm, 50) / 1000;
    const { alt, yaw } = state();
    const h = Math.max(alt, 2) / 1000;

    // солнце и свет
    const dip = Math.acos(RP / (RP + h));
    const elev = track(SUN_ELEV, alt) * DEG, e = elev + dip; // e: высота солнца над видимым горизонтом
    const yawCam = (track(CAM_YAW, alt) + yaw) * DEG;
    const az = yawCam + Math.PI + track(SUN_AZ, alt) * DEG; // солнце по ту сторону аппарата от камеры
    light.uSun.value.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
    const vis = THREE.MathUtils.smoothstep(e / DEG, -0.6, 1.2);
    let tau: number;
    if (elev < 0) { const ht = Math.max(0, (RP + h) * Math.cos(elev) - RP); tau = Math.exp(-ht / HR) * HR * 46; }
    else tau = Math.exp(-h / HR) * HR / (Math.sin(elev) + 0.026);
    const sc = BR.map((b) => 2.6 * vis * Math.exp(-b * tau * 0.55));
    set(light.uSunCol, sc[0], sc[1], sc[2]);
    const st = BR.map((b) => 2.8 * vis * Math.exp(-b * tau * 0.2)); // солнце над слоем облаков: путь короче, свет теплее и ярче
    skyU.uSunTop.value.set(st[0], st[1], st[2]);
    skyU.uRed.value = 0.27 * (1 - THREE.MathUtils.smoothstep(e / DEG, 2, 15));
    const tw = THREE.MathUtils.smoothstep(e / DEG, -16, 3); // сумеречный свет неба
    const day = THREE.MathUtils.smoothstep(e / DEG, -1, 6);
    const amb = 0.10 + 0.5 * tw * (1 - 0.45 * day);
    skyU.uAmb.value.set(0.34 * amb, 0.5 * amb, 1.0 * amb);
    skyU.uTwi.value = 1.6 * THREE.MathUtils.smoothstep(e / DEG, -14, -2) * (1 - 0.8 * THREE.MathUtils.smoothstep(e / DEG, 3, 14));
    const hi = THREE.MathUtils.smoothstep(e / DEG, 0, 12); // диск солнца: у горизонта оранжевый, выше белый
    skyU.uDisc.value.set(vis, vis * (0.5 + 0.45 * hi), vis * (0.2 + 0.7 * hi));
    light.uExp.value = 1.25 - 0.55 * THREE.MathUtils.smoothstep(h, 6, 24); // камера «прикрывает диафрагму» над яркой Землёй
    skyU.uH.value = h; skyU.uTime.value = t; skyU.uCurve.value = 0.06 * THREE.MathUtils.smoothstep(h, 9, 25);

    // свет неба и земли для оболочки и капсулы (те же формулы, что в шейдере неба, в зените)
    const zen = BR.map((b, i) => (1 - Math.exp(-b * HR * Math.exp(-h / HR) * 4)) * (sc[i] * 0.55 + [0.34, 0.5, 1][i] * amb));
    set(light.uSky, zen[0] + 0.012, zen[1] + 0.014, zen[2] + 0.02);
    const up = THREE.MathUtils.smoothstep(h, 0.2, 9);
    set(light.uGround, (0.03 + 0.4 * up) * (sc[0] * 0.5 + 0.34 * amb), (0.035 + 0.48 * up) * (sc[1] * 0.5 + 0.5 * amb), (0.04 + 0.62 * up) * (sc[2] * 0.5 + amb));
    const rim = 0.25 + 0.75 * tw;
    set(light.uRim, rim * (0.3 * amb + sc[0] * 0.35 + skyU.uTwi.value * 0.25), rim * (0.42 * amb + sc[1] * 0.35 + skyU.uTwi.value * 0.1), rim * (0.7 * amb + sc[2] * 0.35));
    glowU.value = 0.03 + 1.7 * (1 - day);
    light.uLow.value = 1 - THREE.MathUtils.smoothstep(h, 0.4, 2.4);
    const e9 = (elev + Math.acos(RP / (RP + 9))) / DEG; // солнце, каким его видят облака на 9 км
    const lit9 = THREE.MathUtils.smoothstep(e9, -5, 2), warm9 = 1 - THREE.MathUtils.smoothstep(e9, 2, 10);
    set(light.uCirrus, 0.4 * amb + lit9 * (warm9 * 1.35 + (1 - warm9) * 1.4), 0.6 * amb + lit9 * (warm9 * 0.56 + (1 - warm9) * 1.3), 1.2 * amb + lit9 * (warm9 * 0.46 + (1 - warm9) * 1.2));
    const flash = still ? 0.3 : Math.pow(Math.max(0, Math.sin(t * 3.4)), 60);
    beacon.scale.setScalar(0.25 + 1.5 * flash); beacon.material.opacity = (0.3 + 0.7 * flash) * (1 - 0.6 * day);

    // облачный слой: аппарат проходит сквозь него
    const k = (h - CLOUD) / 0.55; light.uFog.value = 0.9 * Math.exp(-k * k);
    set(light.uFogCol, 0.5 * (zen[0] + sc[0] * 0.3 + 0.34 * amb), 0.5 * (zen[1] + sc[1] * 0.3 + 0.5 * amb), 0.5 * (zen[2] + sc[2] * 0.3 + amb));
    const tn = (c: number) => { c = Math.pow(1 - Math.exp(-c * light.uExp.value), 1 / 2.2); return c + (c * c * (3 - 2 * c) - c) * 0.5; };
    const fc = light.uFogCol.value; fc.set(tn(fc.x), tn(fc.y), tn(fc.z));

    // оболочка: объём гелия растёт обратно плотности воздуха
    const fill = density(APEX) / density(alt);
    shape(Math.min(1, Math.max(0.3, Math.pow(fill, 0.34))));
    craft.rotation.y = t * 0.02;
    craft.rotation.z = still ? 0 : Math.sin(t * 0.23) * 0.006;
    capsule.rotation.y = -t * 0.05;

    // камера
    const dist = track(wide ? CAM_DIST_W : CAM_DIST, alt), cy = track(wide ? CAM_Y_W : CAM_Y, alt);
    camera.position.set(Math.sin(yawCam) * dist, cy, Math.cos(yawCam) * dist);
    // низкий портретный экран: на старте капсула выше, чтобы текст её не закрывал
    const lift = 0;
    tgt.set(0, track(wide ? TGT_Y_W : TGT_Y, alt) - lift, 0); camera.lookAt(tgt);
    if (wide) camera.setViewOffset(vw, vh, -track(SHIFT_W, alt) * vw, 0, vw, vh); else if (camera.view) camera.clearViewOffset();
    camera.updateMatrixWorld();
    skyU.uCam.value.copy(camera.position); skyU.uGroundY.value = -alt / 10 - 0.45;
    skyU.uProjInv.value.copy(camera.projectionMatrixInverse); skyU.uCamWorld.value.copy(camera.matrixWorld);

    renderer.render(scene, camera);
    if (!shown) { shown = true; canvas.dataset.live = '1'; }

    // если телефон не успевает, снижаем плотность пикселей, а не частоту кадров
    acc += dtm; frames++;
    if (frames === 45) { const avg = acc / frames; acc = 0; frames = 0; if (avg > 24 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); } }
  }
  requestAnimationFrame(frame);
  return true;
}
