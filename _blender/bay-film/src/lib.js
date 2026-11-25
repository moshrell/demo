// lib.js — вспомогательные функции. Ничего недетерминированного.
(function (g) {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

  const ease = {
    lin: (x) => x,
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };

  // прогресс окна [a,b] с функцией сглаживания
  const prog = (t, a, b, e = ease.lin) => e(clamp((t - a) / (b - a)));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- матрицы 2D [a,b,c,d,e,f]: x' = a x + c y + e ; y' = b x + d y + f
  const M = {
    id: () => [1, 0, 0, 1, 0, 0],
    mul: (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ],
    translate: (x, y) => [1, 0, 0, 1, x, y],
    scale: (sx, sy = sx) => [sx, 0, 0, sy, 0, 0],
    rotate: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; },
    apply: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
  };

  // ---- Path: ломаные с кэшем длины, частичная отрисовка "пером"
  class Path {
    constructor() { this.subs = []; this.cur = null; this._len = null; }
    _start(x, y) { this.cur = { pts: [x, y], closed: false }; this.subs.push(this.cur); this._len = null; }
    M(x, y) { this._start(x, y); return this; }
    L(x, y) { if (!this.cur) this._start(x, y); else this.cur.pts.push(x, y); this._len = null; return this; }
    Q(cx, cy, x, y, n = 14) {
      const p = this.cur.pts, x0 = p[p.length - 2], y0 = p[p.length - 1];
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        this.cur.pts.push(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
      }
      this._len = null; return this;
    }
    C(c1x, c1y, c2x, c2y, x, y, n = 22) {
      const p = this.cur.pts, x0 = p[p.length - 2], y0 = p[p.length - 1];
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        this.cur.pts.push(
          u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
          u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y);
      }
      this._len = null; return this;
    }
    // дуга вокруг (cx,cy) радиуса r от угла a0 до a1 (рад, в системе, где y вверх = как задано)
    arc(cx, cy, r, a0, a1, n) {
      n = n || Math.max(8, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 24)));
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (i === 0 && !this.cur) this._start(x, y); else if (i === 0) this.cur.pts.push(x, y); else this.cur.pts.push(x, y);
      }
      this._len = null; return this;
    }
    close() { const p = this.cur.pts; this.cur.pts.push(p[0], p[1]); this.cur.closed = true; this._len = null; return this; }
    rect(x, y, w, h) { return this.M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).close(); }
    line(x0, y0, x1, y1) { return this.M(x0, y0).L(x1, y1); }
    circle(cx, cy, r) { this._start(cx + r, cy); return this.arc(cx, cy, r, 0, Math.PI * 2, 48); }

    _lengths() {
      if (this._len) return this._len;
      let total = 0; const per = [];
      for (const s of this.subs) {
        let l = 0; const p = s.pts;
        for (let i = 2; i < p.length; i += 2) l += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
        per.push(l); total += l;
      }
      this._len = { total, per };
      return this._len;
    }
    get length() { return this._lengths().total; }

    // перенести пути в чужую систему координат (функция f(x,y)->[x,y]) — для контуров с заливкой
    mapped(f) {
      const out = new Path();
      for (const s of this.subs) {
        const p = s.pts; const q = [];
        for (let i = 0; i < p.length; i += 2) { const r = f(p[i], p[i + 1]); q.push(r[0], r[1]); }
        out.subs.push({ pts: q, closed: s.closed });
      }
      return out;
    }

    // добавить в ctx.path часть пути длиной frac*length (после преобразования матрицей m)
    trace(ctx, frac, m) {
      const { total, per } = this._lengths();
      let want = clamp(frac) * total; let tip = null;
      for (let k = 0; k < this.subs.length; k++) {
        if (want <= 0) break;
        const p = this.subs[k].pts; let used = 0;
        let [x, y] = m ? M.apply(m, p[0], p[1]) : [p[0], p[1]];
        ctx.moveTo(x, y); tip = [x, y];
        for (let i = 2; i < p.length; i += 2) {
          const sx = p[i - 2], sy = p[i - 1];
          const seg = Math.hypot(p[i] - sx, p[i + 1] - sy);
          if (used + seg <= want + 1e-9) {
            [x, y] = m ? M.apply(m, p[i], p[i + 1]) : [p[i], p[i + 1]];
            ctx.lineTo(x, y); tip = [x, y]; used += seg;
          } else {
            const f = (want - used) / seg;
            const ex = sx + (p[i] - sx) * f, ey = sy + (p[i + 1] - sy) * f;
            [x, y] = m ? M.apply(m, ex, ey) : [ex, ey];
            ctx.lineTo(x, y); tip = [x, y]; used = want; break;
          }
        }
        want -= per[k];
      }
      return tip; // положение кончика пера (экранные координаты)
    }
    // замкнутый контур целиком (для заливки/клипа)
    fillPath(ctx, m) {
      for (const s of this.subs) {
        const p = s.pts;
        for (let i = 0; i < p.length; i += 2) {
          const [x, y] = m ? M.apply(m, p[i], p[i + 1]) : [p[i], p[i + 1]];
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
    }
  }

  g.Lib = { clamp, lerp, smooth, ease, prog, mulberry32, M, Path };
})(typeof window !== 'undefined' ? window : globalThis);
