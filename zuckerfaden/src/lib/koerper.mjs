// Figuren: Umrisse und Körperteile aus @mjcdev/react-body-highlighter (MIT, Michael Chan), siehe src/lib/LICENSE-koerper.txt.
// Hier: Zonen für Sugaring aus den Körperteilen zusammengesetzt. Koordinaten = viewBox der jeweiligen Ansicht.
import roh from './koerper.json';

const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
const poly = (...p) => `M${p.map((q) => q.join(' ')).join('L')}Z`;

// slugs: Körperteile (Muskel-Formen, werden mit Strich zu einer Fläche), shapes: freie Formen, a: Ankerpunkt für die Preisbeschriftung, s: Seite l/r
const ZONEN = {
  'damen-vorne': [
    { zone: 'd-arme', slugs: ['biceps', 'triceps', 'forearm', 'hands'], a: [176, 446], s: 'l', hit: 60 },
    { zone: 'd-achseln', shapes: [ell(226, 438, 19, 34), ell(414, 438, 19, 34)], a: [226, 438], s: 'l' },
    { zone: 'd-oberschenkel', slugs: ['quadriceps', 'adductors'], a: [236, 790], s: 'l' },
    { zone: 'd-unterschenkel', slugs: ['knees', 'tibialis', 'calves', 'ankles', 'feet'], a: [378, 1190], s: 'r' },
    { zone: 'd-bikini', shapes: ['M222 596Q246 700 320 752Q394 700 418 596L394 596Q372 668 320 712Q268 668 246 596Z'], a: [320, 700], s: 'r' },
  ],
  'damen-hinten': [
    { zone: 'd-arme', slugs: ['triceps', 'forearm', 'hands'], a: [992, 432], s: 'l', hit: 60 },
    { zone: 'd-oberschenkel', slugs: ['hamstring', 'adductors'], a: [1050, 890], s: 'l' },
    { zone: 'd-unterschenkel', slugs: ['calves', 'feet'], a: [1200, 1180], s: 'r' },
  ],
  'herren-vorne': [
    { zone: 'h-brust', slugs: ['chest'], a: [300, 380], s: 'l' },
    { zone: 'h-bauch', slugs: ['abs', 'obliques'], a: [395, 540], s: 'r' },
    { zone: 'h-arme', slugs: ['biceps', 'triceps', 'forearm', 'hands'], a: [206, 452], s: 'l', hit: 60 },
    { zone: 'h-achseln', shapes: [ell(254, 430, 17, 32), ell(474, 430, 17, 32)], a: [254, 430], s: 'l' },
    { zone: 'h-oberschenkel', slugs: ['quadriceps', 'adductors'], a: [292, 810], s: 'l' },
    { zone: 'h-unterschenkel', slugs: ['knees', 'tibialis', 'calves', 'ankles', 'feet'], a: [440, 1140], s: 'r' },
    { zone: 'h-bikini', shapes: ['M256 640Q280 744 365 796Q450 744 474 640L450 640Q428 712 365 752Q302 712 280 640Z'], a: [365, 740], s: 'r' },
  ],
  'herren-hinten': [
    { zone: 'h-schultern', slugs: ['deltoids', 'trapezius'], a: [930, 352], s: 'l' },
    { zone: 'h-ruecken', slugs: ['upper-back', 'lower-back'], a: [1100, 470], s: 'r' },
    { zone: 'h-arme', slugs: ['triceps', 'forearm', 'hands'], a: [905, 450], s: 'l', hit: 60 },
    { zone: 'h-gesaess', slugs: ['gluteal'], a: [1016, 700], s: 'l' },
    { zone: 'h-oberschenkel', slugs: ['hamstring', 'adductors'], a: [990, 880], s: 'l' },
    { zone: 'h-unterschenkel', slugs: ['calves', 'ankles', 'feet'], a: [1170, 1140], s: 'r' },
  ],
};
const KOPF = ['head', 'hair'];
// Umrissrahmen [x0, y0, x1, y1] je Ansicht (gemessen), für Liege und Verlauf
const RAHMEN = { 'damen-vorne': [0, 88, 641, 1433], 'damen-hinten': [822, 207, 1463, 1433], 'herren-vorne': [49, 167, 679, 1351], 'herren-hinten': [769, 166, 1399, 1351] };

export const ANSICHTEN = Object.keys(roh).map((key) => {
  const v = roh[key];
  // Beim Zusammenfügen mehrerer Pfade ist ein führendes kleines m relativ zum vorigen Pfad: deshalb immer absolutes M
  const teile = Object.entries(v.teile).flatMap(([slug, ps]) => ps.map((d, i) => ({ id: `${key}-${slug}-${i}`, slug, d: d.replace(/^\s*m/, 'M') })));
  return {
    key, vb: v.vb, rand: v.rand, rahmen: RAHMEN[key],
    haar: v.teile.hair || [],
    // Muskelformen nur als dezente Modellierung (ohne Kopf)
    relief: teile.filter((t) => !KOPF.includes(t.slug)),
    zonen: ZONEN[key].map((z) => ({
      ...z,
      teile: (z.slugs || []).flatMap((s) => teile.filter((t) => t.slug === s)),
      shapes: z.shapes || [],
      hit: z.hit || 26,
    })),
  };
});
