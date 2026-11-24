// Menü schließen, Schritte einblenden, untere Leiste im Formularbereich verstecken.
const menu = document.querySelector<HTMLDetailsElement>('[data-menu]');
menu?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { menu.open = false; }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu?.open) { menu.open = false; menu.querySelector('summary')?.focus(); } });

const steps = document.querySelectorAll<HTMLElement>('.step');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); en.target.previousElementSibling?.classList.add('is-linked'); io.unobserve(en.target); } });
  }, { threshold: 0.25 });
  steps.forEach((s) => io.observe(s));
} else {
  steps.forEach((s) => s.classList.add('is-in'));
}

const dock = document.querySelector<HTMLElement>('[data-dock]');
const hideOn = ['honorar', 'kontakt'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
if (dock && hideOn.length && 'IntersectionObserver' in window) {
  const live = new Set<Element>();
  const io2 = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) live.add(en.target); else live.delete(en.target); });
    dock.classList.toggle('is-off', live.size > 0);
  }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
  hideOn.forEach((el) => io2.observe(el));
}

// Hero: Grundriss zeichnet sich → Film „Vom Strich zum Haus" → endet im Foto (bei Problemen gleich Foto). Umschalter Grundriss / Modell / Foto.
const plan = document.querySelector<HTMLElement>('[data-plan]');
if (plan) {
  const btns = plan.querySelectorAll<HTMLButtonElement>('[data-set]');
  const film = plan.querySelector<HTMLVideoElement>('.plan__film');
  const press = (v: string | null) => btns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.set === v)));
  let visible = true;
  const playFilm = () => {
    if (!film) return Promise.reject(new Error('kein Video'));
    if (film.preload === 'none') { film.preload = 'auto'; film.load(); }
    return film.play();
  };
  const cap = plan.querySelector<HTMLElement>('[data-cap]');
  const capDefault = cap?.textContent ?? '';
  const [sunA, sunB] = (film?.dataset.sun ?? '0 0').split(' ').map(Number);
  const endAt = Number(film?.dataset.end ?? 0);
  // Bildunterschrift läuft mit dem Film: Grundriss → Modell → Uhr der Sonnenstudie → Foto
  const caption = () => {
    if (!cap || !film) return;
    const v = plan.dataset.view;
    if (v === 'plan') { cap.textContent = 'Grundriss, Erdgeschoss (Beispiel)'; return; }
    if (v === 'photo') { cap.textContent = 'So könnte es aussehen (Beispiel)'; return; }
    if (v !== 'film') { cap.textContent = capDefault; return; }
    const t = film.currentTime;
    if (t < 0.67) cap.textContent = 'Grundriss, Erdgeschoss';
    else if (t < sunA) cap.textContent = 'Modell, Wandhöhe 2,80 m';
    else if (t < endAt) {
      const q = Math.min(1, Math.max(0, (t - sunA) / (sunB - sunA)));
      const min = Math.round((7 * 60 + q * 12 * 60) / 15) * 15;
      cap.textContent = `Sonnenstand am 21. Juni, ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')} Uhr`;
    } else cap.textContent = 'So könnte es aussehen (Beispiel)';
  };
  let raf = 0;
  const tick = () => { caption(); if (film && !film.paused) raf = requestAnimationFrame(tick); };
  film?.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
  const show = (v: string) => {
    plan.dataset.view = v;
    press(v);
    caption();
    if (!film) return;
    if (v === 'film') {
      if (film.ended || film.currentTime >= film.duration - 0.05) film.currentTime = 0;
      playFilm().catch((err) => { console.error('[plan] Film startet nicht', err); show('photo'); });
    } else film.pause();
  };
  // Am Ende steht das Foto (letztes Filmbild = Foto, Übergang unsichtbar)
  film?.addEventListener('ended', () => { if (plan.dataset.view === 'film') show('photo'); });
  btns.forEach((b) => b.addEventListener('click', () => show(b.dataset.set!)));
  plan.querySelector('.plan__toggle')?.removeAttribute('hidden');

  const motion = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  if (!motion) press('photo');
  else if (!film || saveData) {
    // Ohne Film: CSS blendet nach der Zeichnung ins Foto über
    press(null);
    setTimeout(() => { if (plan.dataset.view === 'auto') press('photo'); }, 4250);
  } else {
    plan.classList.add('has-film');
    press(null);
    film.preload = 'auto';
    film.load();
    const intro = new Promise<void>((r) => setTimeout(r, 2700)); // Linien + Füllung fertig gezeichnet
    const ready = new Promise<void>((r, j) => {
      if (film.readyState >= 3) r();
      film.addEventListener('canplay', () => r(), { once: true });
      film.addEventListener('error', () => j(new Error('Video-Fehler')), { once: true });
      setTimeout(() => j(new Error('Video lädt zu lange')), 9000);
    });
    Promise.all([intro, ready])
      .then(() => { if (plan.dataset.view === 'auto') return film.play().then(() => { plan.dataset.view = 'film'; press('film'); caption(); }); })
      .catch((err) => { console.error('[plan] Film nicht verfügbar, zeige Foto', err); if (plan.dataset.view === 'auto') show('photo'); });
  }

  // Film nur abspielen, wenn er zu sehen ist (Akku)
  if (film) {
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (plan.dataset.view !== 'film') return;
      if (visible && !document.hidden) film.play().catch((err) => console.error('[plan] Fortsetzen fehlgeschlagen', err));
      else film.pause();
    }).observe(plan);
    document.addEventListener('visibilitychange', () => {
      if (plan.dataset.view !== 'film') return;
      if (document.hidden || !visible) film.pause();
      else film.play().catch((err) => console.error('[plan] Fortsetzen fehlgeschlagen', err));
    });
  }
}

// Links mit data-art (z. B. „Kaufberatung anfragen“): Projektart im Formular vorwählen
document.querySelectorAll<HTMLAnchorElement>('a[data-art]').forEach((a) => a.addEventListener('click', () => {
  const sel = document.querySelector<HTMLSelectElement>('#anfrage-art');
  if (!sel) { console.error('[site] Projektart-Feld fehlt'); return; }
  sel.value = a.dataset.art!;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}));
