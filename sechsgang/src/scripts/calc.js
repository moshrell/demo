// Preisrechner (Gang 5). Preise stammen aus src/data/site.json.
import site from '../data/site.json';

const root = document.querySelector('[data-calc-root]');
if (root) init();

function init() {
  const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const euro = (c) => eur.format(c / 100);
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem('sg-calc-v1') || 'null'); } catch { return null; } },
    set(v) { try { sessionStorage.setItem('sg-calc-v1', JSON.stringify(v)); } catch {} },
  };

  const NAMES = { own: 'Überführung auf eigener Achse', trailer: 'Überführung auf Anhänger', charter: 'Charter mit Fahrer', search: 'Fahrzeugsuche' };
  const state = { svc: 'own', km: 150, veh: 'limo', hours: site.charter.minHours, extras: [], touched: false };

  const km = $('#km'), range = $('#km-range'), hoursOut = $('#hours');
  const rowsEl = $('[data-rows]'), totalEl = $('[data-total]'), countEl = $('[data-count]'), cta = $('[data-cta]');

  function compute() {
    const rows = [['Leistung', NAMES[state.svc]]];
    let total = 0;
    const add = (label, cents) => { rows.push([label, euro(cents)]); total += cents; };
    if (state.svc === 'own' || state.svc === 'trailer') {
      const t = site.transfer[state.svc];
      const raw = state.km * t.perKmCents;
      if (raw < t.minCents) add(`Mindestpreis (${state.km} km)`, t.minCents);
      else add(`${state.km} km × ${euro(t.perKmCents)}`, raw);
    } else if (state.svc === 'charter') {
      const v = site.charter.vehicles.find((x) => x.id === state.veh);
      add(`${v.name}, ${state.hours} Std. × ${euro(v.perHourCents)}`, v.perHourCents * state.hours);
    } else {
      add('Suche und Briefing (Pauschale)', site.search.baseCents);
    }
    site.extras.filter((e) => e.for.includes(state.svc) && state.extras.includes(e.id)).forEach((e) => add(e.name.replace(' (Behördengebühr extra)', ''), e.cents));
    return { rows, total };
  }

  function paint() {
    // Sichtbarkeit je Leistung
    $$('[data-for]').forEach((n) => {
      const ok = n.dataset.for.split(' ').includes(state.svc);
      n.hidden = !ok;
    });
    const anyExtra = site.extras.some((e) => e.for.includes(state.svc));
    const note = $('[data-no-extras]');
    if (note) note.hidden = anyExtra;
    km.value = String(state.km);
    range.value = String(Math.min(1500, Math.max(10, state.km)));
    hoursOut.textContent = `${state.hours} Std.`;
    $$('[data-hours]').forEach((b) => { b.disabled = (Number(b.dataset.hours) < 0 && state.hours <= site.charter.minHours) || (Number(b.dataset.hours) > 0 && state.hours >= site.charter.maxHours); });
    const { rows, total } = compute();
    rowsEl.replaceChildren(...rows.map(([k, v], i) => {
      const d = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      if (i === 0) dd.style.fontFamily = 'inherit';
      d.append(dt, dd);
      return d;
    }));
    totalEl.textContent = euro(total);
    const n = rows.length - 1;
    countEl.textContent = `${n} ${n === 1 ? 'Position' : 'Positionen'}`;
    cta.textContent = 'Anfragen';
    if (state.touched) {
      window.sgCalc = { rows, total };
      document.dispatchEvent(new CustomEvent('sg:calc'));
    }
  }
  const save = () => store.set({ svc: state.svc, km: state.km, veh: state.veh, hours: state.hours, extras: state.extras, touched: state.touched });
  const touch = () => { state.touched = true; save(); paint(); };

  // Zustand wiederherstellen (Eingaben gehen beim Gangwechsel und Neuladen nicht verloren)
  const saved = store.get();
  if (saved) {
    state.svc = NAMES[saved.svc] ? saved.svc : 'own';
    state.km = Number.isFinite(saved.km) ? saved.km : 150;
    state.veh = site.charter.vehicles.some((v) => v.id === saved.veh) ? saved.veh : 'limo';
    state.hours = Math.min(site.charter.maxHours, Math.max(site.charter.minHours, Number(saved.hours) || site.charter.minHours));
    state.extras = Array.isArray(saved.extras) ? saved.extras : [];
    state.touched = !!saved.touched;
    $$('input[name=svc]').forEach((i) => { i.checked = i.value === state.svc; });
    $$('input[name=veh]').forEach((i) => { i.checked = i.value === state.veh; });
    $$('input[name=extra]').forEach((i) => { i.checked = state.extras.includes(i.value); });
  }

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'svc') state.svc = t.value;
    else if (t.name === 'veh') state.veh = t.value;
    else if (t.name === 'extra') state.extras = $$('input[name=extra]:checked').map((i) => i.value);
    else return;
    touch();
  });
  range.addEventListener('input', () => { state.km = Number(range.value); touch(); });
  km.addEventListener('input', () => {
    const v = Math.round(Number(km.value));
    state.km = Number.isFinite(v) && v > 0 ? Math.min(2000, v) : 10;
    state.touched = true; save();
    range.value = String(Math.min(1500, Math.max(10, state.km)));
    // beim Tippen Feld nicht überschreiben, nur Rechnung aktualisieren
    const { rows, total } = compute();
    rowsEl.replaceChildren(...rows.map(([k, val]) => { const d = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = val; d.append(dt, dd); return d; }));
    totalEl.textContent = euro(total);
    const n = rows.length - 1; countEl.textContent = `${n} ${n === 1 ? 'Position' : 'Positionen'}`;
    window.sgCalc = { rows, total };
    document.dispatchEvent(new CustomEvent('sg:calc'));
  });
  km.addEventListener('blur', () => { km.value = String(state.km); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hours]');
    if (!b) return;
    state.hours = Math.min(site.charter.maxHours, Math.max(site.charter.minHours, state.hours + Number(b.dataset.hours)));
    touch();
  });
  paint();
}
