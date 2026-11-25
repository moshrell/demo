// Статус «открыто/закрыто» для вывесок
export function openState(hours, now = new Date()) {
  const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  const i = (now.getDay() + 6) % 7, h = hours[i], m = now.getHours() * 60 + now.getMinutes();
  const open = !!h.open && m >= toMin(h.open) && m < toMin(h.close);
  let text = open ? `bis ${h.close} Uhr` : 'gerade zu';
  if (!open) {
    const names = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    for (let k = 0; k < 7; k++) {
      const j = (i + k) % 7, d = hours[j];
      if (!d.open || (k === 0 && m >= toMin(d.open))) continue;
      text = `öffnet ${k === 0 ? 'heute' : k === 1 ? 'morgen' : names[j]} um ${d.open} Uhr`;
      break;
    }
  }
  return { open, text, today: i };
}
