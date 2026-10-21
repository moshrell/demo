// Öffnungsstatus nach Uhrzeit in Europe/Berlin (unabhängig von der Zeitzone des Geräts)
export type Hours = { days: number[]; label: string; open: string; close: string }[];

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt = (t: string) => t.replace(/^0/, '');

export function berlinNow(d = new Date()) {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value || '';
  const wd = DAYS.findIndex((x) => get('weekday').startsWith(x));
  return { day: wd, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function berlinStatus(hours: Hours, d = new Date()) {
  const { day, min } = berlinNow(d);
  const today = hours.find((h) => h.days.includes(day));
  if (today && min >= toMin(today.open) && min < toMin(today.close)) {
    return { open: true, text: `Geöffnet bis ${fmt(today.close)}`, long: `Jetzt geöffnet bis ${fmt(today.close)} Uhr. Wir rufen heute noch zurück.` };
  }
  // nächste Öffnung suchen
  for (let i = 0; i < 8; i++) {
    const dd = (day + i) % 7;
    const h = hours.find((x) => x.days.includes(dd));
    if (!h) continue;
    if (i === 0 && min >= toMin(h.open)) continue;
    const when = i === 0 ? 'heute' : i === 1 ? 'morgen' : DAYS[dd];
    return { open: false, text: `Geschlossen · ${when} ab ${fmt(h.open)}`, long: `Gerade geschlossen. Wieder erreichbar ${when} ab ${fmt(h.open)} Uhr. Notfall? Der Notdienst ist rund um die Uhr erreichbar.` };
  }
  return { open: false, text: 'Geschlossen', long: 'Gerade geschlossen.' };
}
