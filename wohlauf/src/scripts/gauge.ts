// Winkelmesser als SVG: reine Geometrie aus Zahlen (Bögen mit runden Enden wie Tape-Streifen).
// kind 'fan'  = Null oben, links/rechts auffächern (Nacken, Rumpf)
// kind 'lift' = Null unten, links/rechts nach oben (Schultern, bis 180°)
export type GaugeSpec = { kind: 'fan' | 'lift'; max: number; ref: [number, number] };
export type GaugeVals = { l: number | null; r: number | null };

export const SPECS: Record<string, GaugeSpec & { warn: number }> = {
  nacken: { kind: 'fan', max: 90, ref: [60, 80], warn: 12 },
  schulter: { kind: 'lift', max: 180, ref: [150, 170], warn: 15 },
  rumpf: { kind: 'fan', max: 60, ref: [30, 40], warn: 10 },
};

const rad = (d: number) => (d * Math.PI) / 180;

export function gaugeSvg(spec: GaugeSpec, v: GaugeVals, labels: { l: string; r: string }, opts: { handle?: boolean; title?: string } = {}) {
  const fan = spec.kind === 'fan';
  const W = 320, H = fan ? 196 : 318, cx = 160, cy = fan ? 172 : 160, R = 124;
  // Fächer mit kleinem Maximum (Rumpf) optisch auf 90° spreizen, damit der Bogen lesbar bleibt
  const scale = fan ? 90 / spec.max : 1;
  const pt = (side: number, a: number, r = R): [number, number] => {
    const t = rad(Math.min(a, spec.max) * scale);
    return [cx + side * r * Math.sin(t), fan ? cy - r * Math.cos(t) : cy + r * Math.cos(t)];
  };
  const arc = (side: number, a1: number, a2: number, r = R) => {
    const [x1, y1] = pt(side, a1, r), [x2, y2] = pt(side, Math.min(a2, spec.max - 0.01), r);
    const sweep = (side > 0) !== !fan ? 1 : 0;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const gap = fan ? 3 / scale : 5;
  const both = v.l != null && v.r != null;
  const diff = both ? Math.abs((v.l as number) - (v.r as number)) : 0;
  const side = (s: number, val: number | null, name: string) => {
    const low = both && diff >= 1 && val === Math.min(v.l as number, v.r as number);
    let o = `<path class="g-track" d="${arc(s, gap, spec.max)}"/><path class="g-ref" d="${arc(s, spec.ref[0], spec.ref[1], R + 15)}"/>`;
    if (val != null && val > gap + 0.5) {
      o += `<path class="g-val${low ? ' g-val--low' : ''}" d="${arc(s, gap, val)}"/>`;
      if (opts.handle && s > 0) { const [hx, hy] = pt(s, val); o += `<circle class="g-handle" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="13"/>`; }
    }
    const tx = cx + s * 56, ty = fan ? cy - 46 : cy + 2;
    o += `<text class="g-num" x="${tx}" y="${ty}" text-anchor="middle">${val == null ? '–' : Math.round(val) + '°'}</text>`;
    o += `<text class="g-lab" x="${tx}" y="${ty + 17}" text-anchor="middle">${name}</text>`;
    return o;
  };
  return `<svg class="gauge gauge--${spec.kind}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.title ?? ''}: ${labels.l} ${v.l == null ? '–' : Math.round(v.l) + '°'}, ${labels.r} ${v.r == null ? '–' : Math.round(v.r) + '°'}">${side(-1, v.l, labels.l)}${side(1, v.r, labels.r)}</svg>`;
}
