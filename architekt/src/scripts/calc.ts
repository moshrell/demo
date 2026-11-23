import cfg from '../data/rechner.json';

/* Honorar-Orientierung nach HOAI 2021 (Gebäude, § 35), vereinfacht:
   Baukosten (KG 300 + 400, brutto) = Fläche × €/m² → anrechenbare Kosten = netto (ohne USt., § 4 Abs. 1)
   → Honorartafel Zone III, Basissatz…oberer Satz (linear interpoliert) → × Anteil der gebuchten Leistungsphasen
   → bei Umbau/Sanierung × Umbauzuschlag 20…33 % (§ 6 Abs. 2, § 36). Ergebnis netto. */

export type CalcState = { type: string; objekt: 'neu' | 'bestand'; area: number; level: string; scope: string };
export const KEY = 'calc:v2';

export const defaults = (): CalcState => ({ type: 'neubau', objekt: 'neu', area: cfg.default, level: 'mittel', scope: 'planung' });

const round = (n: number, step: number) => Math.round(n / step) * step;
const nf = new Intl.NumberFormat('de-DE');
export const eur = (n: number) => `${nf.format(n)} €`;

/** Tafelwert [Basis, oben] für anrechenbare Kosten k. Unter der kleinsten Stufe anteilig (dort ist das Honorar frei vereinbar). */
function tafel(k: number): [number, number] {
  const t = cfg.tafel as [number, number, number][];
  if (k <= t[0][0]) return [t[0][1] * k / t[0][0], t[0][2] * k / t[0][0]];
  for (let i = 1; i < t.length; i++) {
    if (k <= t[i][0]) {
      const [k0, a0, b0] = t[i - 1], [k1, a1, b1] = t[i];
      const f = (k - k0) / (k1 - k0);
      return [a0 + (a1 - a0) * f, b0 + (b1 - b0) * f];
    }
  }
  const [kl, al, bl] = t[t.length - 1];
  return [al * k / kl, bl * k / kl];
}

export function compute(s: CalcState) {
  const t = cfg.types.find((x) => x.id === s.type) ?? cfg.types[0];
  const kind = (t.kind === 'antrag' ? s.objekt : t.kind) as 'neu' | 'bestand' | 'anbau';
  const scope = t.kind === 'antrag' ? cfg.scopes[0] : (cfg.scopes.find((x) => x.id === s.scope) ?? cfg.scopes[1]);
  const rate = (cfg.eurPerSqm as Record<string, Record<string, number>>)[kind][s.level] ?? 0;
  const baukosten = rate * s.area;
  const anrechenbar = baukosten / (1 + cfg.ust / 100);
  const [basis, oben] = tafel(anrechenbar);
  const umbau = kind === 'bestand';
  const zl = umbau ? cfg.umbauZuschlag.lo / 100 : 0;
  const zh = umbau ? cfg.umbauZuschlag.hi / 100 : 0;
  return {
    baukosten: round(baukosten, 1000),
    anrechenbar: round(anrechenbar, 1000),
    lo: round(basis * (scope.share / 100) * (1 + zl), 500),
    hi: round(oben * (scope.share / 100) * (1 + zh), 500),
    klein: anrechenbar < cfg.tafel[0][0],
    umbau,
    scope,
    typeLabel: t.label,
    scopeLabel: scope.label,
    levelLabel: cfg.levels.find((l) => l.id === s.level)?.label ?? '',
  };
}

export const rangeText = (r: ReturnType<typeof compute>) => `ca. ${nf.format(r.lo)} – ${eur(r.hi)}`;
export const summaryText = (s: CalcState) => {
  const r = compute(s);
  return `${r.typeLabel}, ${s.area} m², ${r.levelLabel}, ${r.scopeLabel} (LPH ${r.scope.lp}): ${rangeText(r)} netto`;
};

export function load(): CalcState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.area !== 'number') return null;
    return { ...defaults(), ...d };
  } catch (e) { console.error('[calc] load', e); return null; }
}
export function save(s: CalcState) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.error('[calc] save', e); } }
