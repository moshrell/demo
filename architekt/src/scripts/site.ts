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

// Hero: Grundriss zeichnet sich → Film „Vom Strich zum Haus" → endet im Foto (bei Problemen gleich Foto).
// Danach: Knopf „Modell" auf dem Foto spielt den Film erneut; kommt der Hero nach dem Wegscrollen wieder ins Bild, läuft er einmal von selbst.
const plan = document.querySelector<HTMLElement>('[data-plan]');
if (plan) {
  const film = plan.querySelector<HTMLVideoElement>('.plan__film');
  const replay = plan.querySelector<HTMLButtonElement>('[data-replay]');
  const cap = plan.querySelector<HTMLElement>('[data-cap]');
  const capDefault = cap?.textContent ?? '';
  const [sunA, sunB] = (film?.dataset.sun ?? '0 0').split(' ').map(Number);
  const endAt = Number(film?.dataset.end ?? 0);
  const motion = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  let visible = true;
  let leftView = false; // war der Hero schon einmal aus dem Bild?

  // Bildunterschrift läuft mit dem Film: Grundriss → Modell → Uhr der Sonnenstudie → Foto
  const caption = () => {
    if (!cap) return;
    const v = plan.dataset.view;
    if (v === 'photo') { cap.textContent = 'So könnte es aussehen (Beispiel)'; return; }
    if (v !== 'film' || !film) { cap.textContent = capDefault; return; }
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

  const toPhoto = () => { plan.dataset.view = 'photo'; film?.pause(); caption(); };
  const playFilm = () => {
    if (!film) return;
    if (film.preload === 'none') { film.preload = 'auto'; film.load(); }
    if (film.ended || film.currentTime >= film.duration - 0.05) film.currentTime = 0;
    film.play()
      .then(() => { plan.dataset.view = 'film'; caption(); })
      .catch((err) => { console.error('[plan] Film startet nicht', err); toPhoto(); });
  };

  if (film && replay) {
    replay.hidden = false;
    replay.addEventListener('click', playFilm);
    film.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
    film.addEventListener('ended', () => { if (plan.dataset.view === 'film') toPhoto(); });
  }

  if (!motion) toPhoto();
  else if (!film || saveData) {
    // Ohne Film: CSS blendet nach der Zeichnung ins Foto über
    setTimeout(() => { if (plan.dataset.view === 'auto') { plan.dataset.view = 'photo'; caption(); } }, 4250);
  } else {
    plan.classList.add('has-film');
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
      .then(() => { if (plan.dataset.view === 'auto') return film.play().then(() => { plan.dataset.view = 'film'; caption(); }); })
      .catch((err) => { console.error('[plan] Film nicht verfügbar, zeige Foto', err); if (plan.dataset.view === 'auto') toPhoto(); });
  }

  if (film) {
    // Nur abspielen, wenn zu sehen (Akku); nach Rückkehr in den Hero einmal von vorn
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting && en.intersectionRatio >= 0.6;
      if (!en.isIntersecting) leftView = true;
      if (plan.dataset.view === 'film') {
        if (visible && !document.hidden) film.play().catch((err) => console.error('[plan] Fortsetzen fehlgeschlagen', err));
        else if (!en.isIntersecting) film.pause();
      } else if (visible && leftView && motion && !saveData && plan.dataset.view === 'photo') {
        leftView = false;
        playFilm();
      }
    }, { threshold: [0, 0.6] }).observe(plan);
    document.addEventListener('visibilitychange', () => {
      if (plan.dataset.view !== 'film') return;
      if (document.hidden) film.pause();
      else if (visible) film.play().catch((err) => console.error('[plan] Fortsetzen fehlgeschlagen', err));
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
