// Форматирование для сборки (то же, что в cart.ts на клиенте)
const e0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const e2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
export const euro = (n) => (Number.isInteger(n) ? e0 : e2).format(n);
export const dauer = (min) => { if (!min) return ''; if (min < 60) return `${min} Min.`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h} Std. ${m} Min.` : `${h} Std.`; };
