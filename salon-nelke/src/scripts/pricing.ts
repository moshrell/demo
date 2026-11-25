// Расчёт образа: одна функция и для конструктора, и для карточек на стене образов
export type Look = { hair: string; color: string; beard: string };
export type Item = { name: string; price: number; min: number; consult: boolean };
export const LEN: Record<string, number> = { kurz: 0, bob: 1, lang: 2, locken: 1, tolle: 0, glatze: 0 };
// Натуральные цвета окрашивания не требуют
export const NATURAL = new Set(['#1f1d24', '#4a2f22']);

export function lookItems(services: Record<string, any>, look: Look): Item[] {
  const out: Item[] = [];
  const li = LEN[look.hair] ?? 1;
  const pick = (name: string, idx: number, consult = false) => {
    const s = services[name];
    const price = Array.isArray(s.price) ? s.price[idx] : s.price, min = Array.isArray(s.min) ? s.min[idx] : s.min;
    out.push({ name, price, min, consult: consult || !!s.consult });
  };
  if (look.hair === 'glatze') pick('Maschinenschnitt', 0); else pick('Schnitt & Föhnen', li);
  if (!NATURAL.has(look.color)) pick('Komplettfarbe', Math.max(li, 0), true);
  if (look.beard !== 'none') pick('Bart trimmen', 0);
  return out;
}

export const sumOf = (items: Item[]) => ({
  total: items.reduce((a, s) => a + s.price, 0),
  dur: items.reduce((a, s) => a + s.min, 0),
  consult: items.some((s) => s.consult),
});
