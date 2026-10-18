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

// Hero: Umschalter Grundriss/Foto
const plan = document.querySelector<HTMLElement>('[data-plan]');
if (plan) {
  const btns = plan.querySelectorAll<HTMLButtonElement>('[data-set]');
  btns.forEach((b) => b.addEventListener('click', () => {
    plan.dataset.view = b.dataset.set;
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  plan.querySelector('.plan__toggle')?.removeAttribute('hidden');
  const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
  btns.forEach((x) => x.setAttribute('aria-pressed', String(!mq.matches && x.dataset.set === 'photo')));
  if (mq.matches) { // Automatik läuft: Knopf „Grundriss“ während der Zeichnung nicht gedrückt, nach der Überblendung „Foto“
    setTimeout(() => { if (plan.dataset.view === 'auto') btns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.set === 'photo'))); }, 5700);
  }
}
