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

// Hero: Grundriss zeichnet sich → Film „Vom Strich zum Haus" (Schleife) → bei Problemen Foto. Umschalter Grundriss / Modell / Foto.
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
  const show = (v: string) => {
    plan.dataset.view = v;
    press(v);
    if (!film) return;
    if (v === 'film') {
      playFilm().catch((err) => { console.error('[plan] Film startet nicht', err); show('photo'); });
    } else film.pause();
  };
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
      .then(() => { if (plan.dataset.view === 'auto') return film.play().then(() => { plan.dataset.view = 'film'; press('film'); }); })
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
