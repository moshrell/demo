// Einsatzgebiet: Prüfung per Postleitzahl
import data from '../data/plz.json';

export type PlzResult = { state: 'empty' | 'partial' | 'in' | 'out'; text: string; anfahrt?: number; ort?: string; zone?: number };

export function checkPlz(raw: string): PlzResult {
  const plz = raw.replace(/\D/g, '').slice(0, 5);
  if (!plz) return { state: 'empty', text: '' };
  if (plz.length < 5) return { state: 'partial', text: 'Bitte 5 Ziffern eingeben.' };
  for (const z of data.zones) {
    const ort = (z.plz as Record<string, string>)[plz];
    if (ort) {
      const extra = z.notdienst ? 'Notdienst inklusive.' : 'Notdienst hier leider nicht.';
      return { state: 'in', zone: z.id, ort, anfahrt: z.anfahrt, text: `Ja, wir kommen nach ${ort}. Anfahrt ${z.anfahrt} €. ${extra}` };
    }
  }
  return { state: 'out', text: `${plz} liegt leider außerhalb unseres Gebiets. Ein Betrieb in Ihrer Nähe: Fachbetriebsuche der Elektro-Innungen.` };
}

export const outsideLink = data.outsideLink;
