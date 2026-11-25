// Salon Nelke: общая анимация страницы (появление, слова из-под маски, шапка). Без библиотек.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function splitWords(el) {
  let i = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(' '); continue; }
          const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
          const inner = document.createElement('span'); inner.textContent = part;
          w.append(inner); w.style.setProperty('--i', i++);
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
    }
  };
  walk(el);
}
for (const el of $$('[data-split]')) {
  el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' '));
  splitWords(el);
  el.classList.add('split');
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
$$('.reveal, .split').forEach((el) => io.observe(el));

// Шапка: прячется при прокрутке вниз, возвращается при движении вверх
const nav = document.querySelector('[data-nav]');
if (nav) {
  let last = scrollY, tick = false;
  addEventListener('scroll', () => {
    if (tick) return; tick = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      nav.classList.toggle('is-scrolled', y > 10);
      nav.classList.toggle('is-hidden', !reduce && y > last + 4 && y > 400);
      if (y < last - 4) nav.classList.remove('is-hidden');
      last = y; tick = false;
    });
  }, { passive: true });
}
