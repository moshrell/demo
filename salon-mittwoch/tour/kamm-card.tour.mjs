// Studio Kamm: die Seite ist die Buchung (Stepper): Leistungen → Person → Tag/Zeit → Daten → Ticket. ~14 s
export const meta = {};

export default async function tour(t) {
  await t.hold(1.0);
  await t.tap('[data-len="2"]', {move: 0.6, after: 0.2});
  await t.tap('.svc[data-key="schnitt-0"]', {move: 0.5, after: 0.2});
  await t.tap('.cat-head[aria-controls="cat-farbe"]', {move: 0.4, after: 0.3});
  await t.tap('.svc[data-key="farbe-3"]', {move: 0.5, after: 0.9});     // Summe läuft mit
  await t.tap('.next', {move: 0.5, after: 0.6});
  await t.tap('[data-person="lena"]', {move: 0.5, after: 0.3});
  await t.tap('.next', {move: 0.4, after: 0.6});
  await t.tap('.cal-grid button:not(:disabled)', {idx: 2, move: 0.5, after: 0.3});
  await t.tap('.slots button:not(:disabled)', {idx: 3, move: 0.5, after: 0.3});
  await t.tap('.next', {move: 0.4, after: 0.5});
  await t.type('#f-name', 'Anna Beispiel', 14);
  await t.type('#f-tel', '0511 1234567', 14);
  await t.tap('#f-privacy', {move: 0.3, after: 0.2});
  await t.tap('.next', {move: 0.4, after: 1.8});                         // Ticket
}
