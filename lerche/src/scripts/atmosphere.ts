// Стандартная атмосфера (ISA) и геометрия полёта: из них считаются приборы и свет сцены.
import flight from '../data/flight.json';

export const APEX = flight.apex;
export const CLIMB = 5; // м/с

/** Температура за бортом, °C */
export function temperature(m: number): number {
  if (m <= 11000) return 15 - 0.0065 * m;
  if (m <= 20000) return -56.5;
  return -56.5 + 0.001 * (m - 20000);
}

/** Давление, гПа */
export function pressure(m: number): number {
  if (m <= 11000) return 1013.25 * Math.pow(1 - 0.0065 * m / 288.15, 5.2559);
  if (m <= 20000) return 226.32 * Math.exp(-(m - 11000) / 6341.6);
  return 54.75 * Math.pow(1 + 0.001 * (m - 20000) / 216.65, -34.163);
}

/** Плотность относительно уровня моря */
export function density(m: number): number {
  return (pressure(m) / 1013.25) * (288.15 / (temperature(m) + 273.15));
}

/** Дальность горизонта, км (с высоты роста на земле) */
export function horizon(m: number): number {
  return Math.sqrt(2 * 6371 * Math.max(m, 2) / 1000);
}

/** Минуты от старта при подъёме 5 м/с */
export const minutes = (m: number) => m / CLIMB / 60;

export function tplus(m: number): string {
  const t = Math.round(minutes(m));
  return `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Ключевые точки подъёма: доля прокрутки → высота. Между точками линейно.
const KEYS: [number, number][] = flight.stations.map((s, i, a) => [i / (a.length - 1), s.alt]);

export function altAt(p: number): number {
  p = Math.min(1, Math.max(0, p));
  for (let i = 1; i < KEYS.length; i++) {
    if (p <= KEYS[i][0]) {
      const [p0, a0] = KEYS[i - 1], [p1, a1] = KEYS[i];
      return a0 + (a1 - a0) * (p - p0) / (p1 - p0);
    }
  }
  return APEX;
}

/** Плавная интерполяция значений, заданных по ключевым высотам станций */
export function track(values: number[], m: number): number {
  const s = flight.stations;
  for (let i = 1; i < s.length; i++) {
    if (m <= s[i].alt) {
      let k = (m - s[i - 1].alt) / (s[i].alt - s[i - 1].alt);
      k = k * k * (3 - 2 * k);
      return values[i - 1] + (values[i] - values[i - 1]) * k;
    }
  }
  return values[values.length - 1];
}
