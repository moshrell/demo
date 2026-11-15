import { blattZusammenfassung, base, save } from './blatt-core';
const z = blattZusammenfassung();
if (z.complete) save();
const box = document.querySelector<HTMLElement>('[data-blatt]');
const sum = document.getElementById('blatt-summary');
if (z.complete && box) {
  const ab = z.e.bel === 'bmehr' ? 'ab ' : '';
  box.dataset.rows = JSON.stringify(z.zeilen.map(([k, v], i) => [k, v, i === 3]));
  box.hidden = false;
  box.innerHTML = '<p><strong>Aus Ihrem Blatt übernommen:</strong> ' + z.zeilen.slice(0, 3).map(([, v]) => v).join(', ') + '. Richtwert ' + ab + z.s.monat + ' € im Monat. <a href="' + base + '#fristen">Angaben ändern</a></p>';
  const bar = document.querySelector('[data-bar-text]');
  if (bar) bar.textContent = 'Richtwert Blatt: ' + ab + z.s.monat.toLocaleString('de-DE') + ' € im Monat, dazu ' + z.s.jahr.toLocaleString('de-DE') + ' € im Jahr';
}
if (sum && !z.complete) sum.hidden = false;
