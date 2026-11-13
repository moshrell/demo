// Общее для блока примерки на странице и камеры на весь экран: «запомненные» оправы и цвет-кружок.
import type { Paint } from './frames';

export type Merk = { f: string; p: string };
const KEY = 'fp:merk';
export const readMerk = (): Merk[] => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { return []; } };
export const writeMerk = (m: Merk[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch {} };
/** Добавляет/убирает оправу в «Gemerkt» (не больше трёх). Возвращает true, если теперь запомнена. */
export function toggleMerk(f: string, p: string): boolean {
  const m = readMerk(); const i = m.findIndex((x) => x.f === f && x.p === p);
  if (i >= 0) { m.splice(i, 1); writeMerk(m); return false; }
  m.push({ f, p }); writeMerk(m.slice(-3)); return true;
}
export const isMerk = (f: string, p: string) => readMerk().some((x) => x.f === f && x.p === p);

export function swatch(p: Paint): string {
  return p.pattern
    ? 'radial-gradient(circle at 30% 30%, #d9994a 0 22%, transparent 24%), radial-gradient(circle at 70% 65%, #2b1206 0 30%, transparent 32%), #8a4a18'
    : `linear-gradient(135deg, ${p.rim2 ?? p.rim}, ${p.rim} 60%)`;
}

/** Сообщение между блоком на странице и камерой: какая оправа выбрана сейчас. */
export type Wahl = { f: string; p: string };
