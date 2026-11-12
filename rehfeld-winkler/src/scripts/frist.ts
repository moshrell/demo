// Fristrechner (Orientierung, keine Rechtsberatung). Konservativ: gezeigt wird immer das rechnerisch frühere Ende;
// verschiebt sich das Ende wegen Wochenende/Feiertag (§ 193 BGB), steht der spätere Tag nur als Hinweis daneben.
export type FristKind = 'kschg' | 'mieterhoehung' | 'nebenkosten';

const day = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0); // 12 Uhr: keine Zeitumstellungs-Fehler
const addDays = (d: Date, n: number) => day(d.getFullYear(), d.getMonth(), d.getDate() + n);
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function easter(y: number): Date {
  // Gauß/Meeus: Ostersonntag im gregorianischen Kalender
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1, dd = ((h + l - 7 * m + 114) % 31) + 1;
  return day(y, month, dd);
}

/** Gesetzliche Feiertage in Niedersachsen (Reformationstag seit 2018). */
export function holidays(y: number): Map<string, string> {
  const e = easter(y);
  const list: [Date, string][] = [
    [day(y, 0, 1), 'Neujahr'],
    [addDays(e, -2), 'Karfreitag'],
    [addDays(e, 1), 'Ostermontag'],
    [day(y, 4, 1), 'Tag der Arbeit'],
    [addDays(e, 39), 'Christi Himmelfahrt'],
    [addDays(e, 50), 'Pfingstmontag'],
    [day(y, 9, 3), 'Tag der Deutschen Einheit'],
    [day(y, 9, 31), 'Reformationstag'],
    [day(y, 11, 25), '1. Weihnachtstag'],
    [day(y, 11, 26), '2. Weihnachtstag'],
  ];
  return new Map(list.map(([d, n]) => [key(d), n]));
}

export function nonWorkReason(d: Date): string | null {
  const wd = d.getDay();
  if (wd === 6) return 'Samstag';
  if (wd === 0) return 'Sonntag';
  return holidays(d.getFullYear()).get(key(d)) ?? null;
}

/** Nächster Werktag ab d (Wochenende und Feiertage übersprungen). */
export function nextWorkday(d: Date): Date {
  let x = d;
  while (nonWorkReason(x)) x = addDays(x, 1);
  return x;
}

export function parseISO(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = day(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

/** Rechnerisches Fristende nach §§ 187, 188 BGB. */
export function fristEnd(kind: FristKind, zugang: Date): Date {
  const y = zugang.getFullYear(), m = zugang.getMonth(), d = zugang.getDate();
  if (kind === 'kschg') return addDays(zugang, 21); // drei Wochen: gleicher Wochentag
  if (kind === 'mieterhoehung') return day(y, m + 3, 0); // Ende des übernächsten Kalendermonats
  // nebenkosten: zwölf Monate, gleicher Kalendertag; fehlt er (29.02.), der letzte Tag des Monats
  const t = day(y + 1, m, d);
  return t.getMonth() === m ? t : day(y + 1, m + 1, 0);
}

export interface FristResult {
  end: Date;
  shifted: Date | null; // späterer Tag, falls Ende auf Wochenende/Feiertag fällt
  reason: string | null;
  daysLeft: number; // ab heute, negativ = abgelaufen
  elapsed: number; // Anteil 0..1 zwischen Zugang und Ende
}

export function calc(kind: FristKind, zugang: Date, today = new Date()): FristResult {
  const end = fristEnd(kind, zugang);
  const reason = nonWorkReason(end);
  const t0 = day(today.getFullYear(), today.getMonth(), today.getDate());
  const total = Math.round((end.getTime() - zugang.getTime()) / 864e5) || 1;
  const done = Math.round((t0.getTime() - zugang.getTime()) / 864e5);
  return {
    end,
    shifted: reason ? nextWorkday(end) : null,
    reason,
    daysLeft: Math.round((end.getTime() - t0.getTime()) / 864e5),
    elapsed: Math.min(1, Math.max(0, done / total)),
  };
}

const fmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDate = (d: Date) => fmt.format(d);

export function iso(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
