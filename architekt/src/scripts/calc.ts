import cfg from '../data/rechner.json';

export type CalcState = { type: string; objekt: 'neu' | 'bestand'; area: number; level: string; scope: string };
export const KEY = 'calc:v1';

export const defaults = (): CalcState => ({ type: 'neubau', objekt: 'neu', area: cfg.default, level: 'mittel', scope: 'planung' });

const round = (n: number, step: number) => Math.round(n / step) * step;
const nf = new Intl.NumberFormat('de-DE');
export const eur = (n: number) => `${nf.format(n)} €`;

export function compute(s: CalcState) {
  const t = cfg.types.find((x) => x.id === s.type) ?? cfg.types[0];
  const kind = (t.kind === 'antrag' ? s.objekt : t.kind) as 'neu' | 'bestand' | 'anbau';
  const scope = t.kind === 'antrag' ? cfg.scopes[0] : (cfg.scopes.find((x) => x.id === s.scope) ?? cfg.scopes[1]);
  const rate = (cfg.eurPerSqm as Record<string, Record<string, number>>)[kind][s.level] ?? 0;
  const baukosten = rate * s.area;
  const add = kind === 'bestand' ? cfg.bestandAufschlag : 0;
  return {
    baukosten: round(baukosten, 1000),
    lo: round((baukosten * (scope.lo + add)) / 100, 500),
    hi: round((baukosten * (scope.hi + add)) / 100, 500),
    typeLabel: t.label,
    scopeLabel: scope.label,
    levelLabel: cfg.levels.find((l) => l.id === s.level)?.label ?? '',
  };
}

export const rangeText = (r: ReturnType<typeof compute>) => `ca. ${new Intl.NumberFormat('de-DE').format(r.lo)} – ${eur(r.hi)}`;
export const summaryText = (s: CalcState) => {
  const r = compute(s);
  return `${r.typeLabel}, ${s.area} m², ${r.levelLabel}, ${r.scopeLabel}: ${rangeText(r)}`;
};

export function load(): CalcState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.area !== 'number') return null;
    return { ...defaults(), ...d };
  } catch { return null; }
}
export function save(s: CalcState) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
