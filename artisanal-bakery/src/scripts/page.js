// Seitenlogik außerhalb des Heros: Kopfzeile, Aussagen, Click & Collect.

const eur = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

// Click & Collect: Samstag/Sonntag, Bestellschluss 18:00 Uhr am Vortag.
function order() {
  const form = document.querySelector('[data-order]');
  if (!form) return;
  const dayBox = form.querySelector('[data-days]');
  const whenEl = form.querySelector('[data-when]');
  const linesEl = form.querySelector('[data-lines]');
  const sumEl = form.querySelector('[data-sum]');
  const errEl = form.querySelector('[data-err]');
  const submit = form.querySelector('button[type=submit]');
  const doneEl = document.querySelector('[data-done]');

  const now = new Date();
  const opts = [];
  for (let i = 0; i < 28 && opts.length < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() !== 6 && d.getDay() !== 0) continue;
    if (now >= new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 18, 0)) continue;
    opts.push({
      wd: d.toLocaleDateString('de-DE', { weekday: 'long' }),
      date: d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }),
    });
  }
  dayBox.innerHTML = opts.map((o, i) =>
    `<label class="choice"><input type="radio" name="day" value="${o.wd}, ${o.date}" ${i === 0 ? 'checked' : ''}><span><b>${o.wd}</b><small>${o.date}</small></span></label>`
  ).join('') || '<p class="muted">Aktuell ist kein Abholtag verfügbar.</p>';

  const rows = [...form.querySelectorAll('[data-row]')];
  const qty = new Map();
  const total = () => rows.reduce((s, r) => s + (qty.get(r.dataset.id) || 0) * Number(r.dataset.price), 0);

  // Eingaben im Tab zwischenspeichern (sessionStorage), Einwilligung bewusst nicht
  const KEY = 'artisanal-form:' + location.pathname;
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        qty: Object.fromEntries(qty), day: form.querySelector('input[name=day]:checked')?.value || '',
        slot: form.querySelector('input[name=slot]:checked')?.value || '',
        name: form.elements.name.value, phone: form.elements.phone.value,
      }));
    } catch (e) { /* Speicher gesperrt: egal */ }
  };
  const clearSaved = () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* egal */ } };
  const restore = () => {
    try {
      const d = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!d) return;
      rows.forEach((r) => {
        const v = Math.max(0, Math.min(30, Number(d.qty?.[r.dataset.id]) || 0));
        qty.set(r.dataset.id, v); r.querySelector('[data-qty]').textContent = String(v);
      });
      [['day', d.day], ['slot', d.slot]].forEach(([n, v]) => { const el = [...form.querySelectorAll(`input[name=${n}]`)].find((i) => i.value === v); if (el) el.checked = true; });
      form.elements.name.value = d.name || ''; form.elements.phone.value = d.phone || '';
    } catch (e) { /* kaputter Eintrag: ignorieren */ }
  };

  const render = () => {
    const day = form.querySelector('input[name=day]:checked')?.value;
    const slot = form.querySelector('input[name=slot]:checked')?.value;
    whenEl.textContent = day ? `Abholung: ${day}, ${slot} Uhr` : 'Abholung: bitte Tag wählen';
    const chosen = rows.filter((r) => (qty.get(r.dataset.id) || 0) > 0);
    linesEl.innerHTML = chosen.length
      ? chosen.map((r) => `<li><span>${qty.get(r.dataset.id)} × ${r.dataset.name}</span><span>${eur(qty.get(r.dataset.id) * Number(r.dataset.price))}</span></li>`).join('')
      : '<li class="empty">Noch nichts gewählt.</li>';
    sumEl.textContent = eur(total());
    errEl.textContent = '';
    cartRender();
    save();
  };

  // Sticky Summe unten (Handy): wächst mit der Auswahl, verschwindet, solange die Zusammenfassung sichtbar ist
  const bar = document.querySelector('[data-cartbar]');
  const barSum = bar?.querySelector('[data-cart-sum]');
  const barCount = bar?.querySelector('[data-cart-count]');
  const barGo = bar?.querySelector('[data-cart-go]');
  const receipt = form.querySelector('.receipt');
  const contact = form.querySelector('[data-contact]');
  let inSection = false, receiptSeen = false;
  const count = () => rows.reduce((n, r) => n + (qty.get(r.dataset.id) || 0), 0);
  const consentEl = form.querySelector('input[name=consent]');
  const consentErr = form.querySelector('[data-consent-err]');
  const contactDone = () => [...form.querySelectorAll('.fields input')].every((i) => i.value.trim()) && consentEl.checked;
  function cartRender() {
    if (!bar) return;
    const n = count();
    barSum.textContent = eur(total());
    barCount.textContent = n === 1 ? '1 Artikel' : `${n} Artikel`;
    barGo.textContent = contactDone() ? 'Vorbestellung senden' : 'Weiter';
    bar.classList.toggle('is-on', n > 0 && inSection && !receiptSeen);
  }
  if (bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { inSection = en.isIntersecting; cartRender(); }, { threshold: 0.02 }).observe(form);
    new IntersectionObserver(([en]) => { receiptSeen = en.isIntersecting; cartRender(); }, { threshold: 0.5 }).observe(receipt);
    form.addEventListener('input', cartRender);
    barGo.addEventListener('click', () => {
      if (contactDone()) form.requestSubmit();
      else { contact.scrollIntoView({ behavior: 'smooth', block: 'center' }); ([...form.querySelectorAll('.fields input')].find((i) => !i.value.trim()) || consentEl).focus({ preventScroll: true }); }
    });
  }

  rows.forEach((r) => {
    const out = r.querySelector('[data-qty]');
    const set = (n) => { const v = Math.max(0, Math.min(30, n)); qty.set(r.dataset.id, v); out.textContent = String(v); render(); };
    r.querySelector('[data-inc]').addEventListener('click', () => set((qty.get(r.dataset.id) || 0) + 1));
    r.querySelector('[data-dec]').addEventListener('click', () => set((qty.get(r.dataset.id) || 0) - 1));
  });
  form.addEventListener('input', save);
  form.addEventListener('change', (e) => { if (e.target.name === 'day' || e.target.name === 'slot') render(); if (e.target === consentEl && consentEl.checked) { consentErr.hidden = true; consentEl.removeAttribute('aria-invalid'); } cartRender(); });
  restore();
  consentEl.checked = false;
  addEventListener('pageshow', () => { consentEl.checked = false; cartRender(); });
  render();

  doneEl.querySelector('[data-done-new]').addEventListener('click', () => {
    clearSaved(); qty.clear(); rows.forEach((r) => { r.querySelector('[data-qty]').textContent = '0'; });
    form.reset(); form.querySelectorAll('.fields input, input[name=consent]').forEach((i) => i.removeAttribute('aria-invalid')); consentErr.hidden = true;
    doneEl.hidden = true; form.hidden = false; render(); clearSaved();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim(), phone = String(fd.get('phone') || '').trim();
    const lines = rows.filter((r) => (qty.get(r.dataset.id) || 0) > 0).map((r) => `${qty.get(r.dataset.id)} x ${r.dataset.name}`);
    if (!fd.get('day')) { errEl.textContent = 'Bitte wählen Sie einen Abholtag.'; return; }
    if (!lines.length) { errEl.textContent = 'Bitte wählen Sie mindestens ein Produkt.'; return; }
    const fields = [...form.querySelectorAll('.fields input')];
    const digits = phone.replace(/\D/g, '');
    fields.forEach((i) => i.setAttribute('aria-invalid', String(i.name === 'phone' ? digits.length < 6 : !i.value.trim())));
    const bad = fields.find((i) => i.getAttribute('aria-invalid') === 'true');
    if (bad) {
      errEl.textContent = bad.name === 'phone' && phone ? 'Bitte geben Sie eine gültige Telefonnummer an, zum Beispiel +49 151 23456789.' : 'Bitte geben Sie Name und Telefonnummer an.';
      bad.focus();
      return;
    }
    if (!consentEl.checked) {
      consentEl.setAttribute('aria-invalid', 'true'); consentErr.hidden = false; errEl.textContent = '';
      consentEl.focus();
      return;
    }
    submit.disabled = true; submit.textContent = 'Wird gesendet …';
    // Demo: kurze Wartezeit wie bei einer echten Übertragung, dann Bestätigung auf der Seite
    setTimeout(() => {
      const no = 'A-' + String(Math.floor(1000 + Math.random() * 9000));
      doneEl.querySelector('[data-done-title]').textContent = `Vielen Dank, ${name.split(/\s+/)[0]}.`;
      doneEl.querySelector('[data-done-phone]').textContent = phone;
      doneEl.querySelector('[data-done-no]').textContent = no;
      doneEl.querySelector('[data-done-when]').textContent = `${fd.get('day')}, ${fd.get('slot')} Uhr`;
      doneEl.querySelector('[data-done-lines]').innerHTML = rows.filter((r) => (qty.get(r.dataset.id) || 0) > 0)
        .map((r) => `<li><span>${qty.get(r.dataset.id)} × ${r.dataset.name}</span><span>${eur(qty.get(r.dataset.id) * Number(r.dataset.price))}</span></li>`).join('');
      doneEl.querySelector('[data-done-sum]').textContent = eur(total());
      clearSaved();
      form.hidden = true; doneEl.hidden = false; inSection = false; cartRender();
      doneEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      doneEl.querySelector('[data-done-title]').focus({ preventScroll: true });
      submit.disabled = false; submit.textContent = 'Vorbestellung senden';
    }, 900);
  });
}

// Menü auf dem Handy: fährt von rechts ein, Esc und Klick daneben schließen
function menu() {
  const btn = document.querySelector('[data-burger]');
  const drawer = document.querySelector('[data-drawer]');
  const scrim = document.querySelector('[data-scrim]');
  if (!btn || !drawer) return;
  const root = document.documentElement;
  const set = (open) => {
    root.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    if (open) drawer.querySelector('a')?.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => set(!root.classList.contains('menu-open')));
  scrim.addEventListener('click', () => set(false));
  drawer.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('menu-open')) { set(false); btn.focus(); } });
  window.matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

export function initPage() {
  try { menu(); } catch (e) { console.error('[page] menu', e); }
  try { order(); } catch (e) { console.error('[page] order', e); }
}
