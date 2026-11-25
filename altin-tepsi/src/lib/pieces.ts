// Gebäckstücke von oben gesehen, als SVG-Strings. Farben kommen aus den Klassen .pc-* in global.css (Tokens).
// Dieselben Strings nutzen die Seite (Astro) und das Skript (page.js), damit Tablett, Liste und Box gleich aussehen.
const svg = (inner: string) =>
  `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${inner}</svg>`;

const diamond = (nut: 'pc-pis' | 'pc-nut') =>
  svg(
    `<polygon class="pc-crust" points="50,3 97,50 50,97 3,50"/>` +
      `<polygon class="pc-glaze" points="50,12 88,50 50,88 12,50"/>` +
      `<path class="pc-line" d="M31 31 L69 69 M42 21 L79 58 M21 42 L58 79"/>` +
      `<circle class="${nut}" cx="50" cy="50" r="8"/>` +
      `<circle class="${nut}" cx="40" cy="42" r="4.5"/><circle class="${nut}" cx="60" cy="42" r="4.5"/>` +
      `<circle class="${nut}" cx="42" cy="60" r="4.5"/><circle class="${nut}" cx="58" cy="60" r="4.5"/>`,
  );

export const PIECES: Record<string, string> = {
  pistazie: diamond('pc-pis'),
  walnuss: diamond('pc-nut'),
  sarma: svg(
    `<rect class="pc-crust" x="5" y="27" width="90" height="46" rx="23"/>` +
      `<rect class="pc-glaze" x="11" y="33" width="78" height="34" rx="17"/>` +
      `<path class="pc-line" d="M32 34 L40 66 M46 34 L54 66 M60 34 L68 66"/>` +
      `<ellipse class="pc-pis" cx="15" cy="50" rx="6" ry="13"/><ellipse class="pc-pis" cx="85" cy="50" rx="6" ry="13"/>`,
  ),
  kadayif: svg(
    `<circle class="pc-crust" cx="50" cy="50" r="45"/>` +
      `<circle class="pc-glaze" cx="50" cy="50" r="38"/>` +
      `<path class="pc-line" d="M50 24 a26 26 0 1 1 -0.1 0 M50 36 a14 14 0 1 1 -0.1 0 M50 11 a39 39 0 1 1 -0.1 0"/>` +
      `<circle class="pc-pis" cx="50" cy="50" r="6"/><circle class="pc-pis" cx="33" cy="64" r="3.5"/><circle class="pc-pis" cx="68" cy="38" r="3.5"/>`,
  ),
  lokum: svg(
    `<rect class="pc-rose" x="7" y="20" width="42" height="42" rx="7"/>` +
      `<rect class="pc-mint" x="51" y="38" width="42" height="42" rx="7"/>` +
      `<circle class="pc-dust" cx="18" cy="32" r="2.6"/><circle class="pc-dust" cx="32" cy="26" r="2"/><circle class="pc-dust" cx="38" cy="46" r="2.6"/><circle class="pc-dust" cx="22" cy="52" r="2"/>` +
      `<circle class="pc-dust" cx="62" cy="50" r="2.6"/><circle class="pc-dust" cx="78" cy="46" r="2"/><circle class="pc-dust" cx="82" cy="68" r="2.6"/><circle class="pc-dust" cx="66" cy="70" r="2"/>`,
  ),
  halva: svg(
    `<rect class="pc-halva" x="6" y="25" width="88" height="50" rx="9"/>` +
      `<path class="pc-halva-line" d="M24 31 V69 M40 31 V69 M56 31 V69 M72 31 V69"/>` +
      `<circle class="pc-pis" cx="32" cy="50" r="4.5"/><circle class="pc-pis" cx="64" cy="50" r="4.5"/><circle class="pc-pis" cx="82" cy="40" r="3.5"/>`,
  ),
};
