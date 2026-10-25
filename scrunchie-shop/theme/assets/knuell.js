/* Knüll: kleine, abhängigkeitsfreie Komponenten.
   - <k-hero-picker>: Farbe auf der Startseite wählen (Foto, Name, Preis, Link wechseln mit)
   - <knuell-total>: Live-Summe auf der Produktseite + Sticky-Leiste auf dem Handy */

class KHeroPicker extends HTMLElement {
  connectedCallback() {
    this.url = this.dataset.productUrl;
    this.figures = [...this.querySelectorAll('.k-hero__figure')];
    this.dots = [...this.querySelectorAll('.k-dot')];
    this.nameEl = this.querySelector('[data-hero-name]');
    this.priceEl = this.querySelector('[data-hero-price]');
    this.cta = this.querySelector('[data-hero-cta]');
    this.media = this.querySelector('.k-hero__media');
    this.index = 0;

    this.dots.forEach((dot, i) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        this.select(i);
      });
    });

    // Wischen auf dem Foto wechselt die Farbe (Handy)
    let startX = 0;
    let startY = 0;
    this.media.addEventListener('touchstart', (e) => {
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
    }, { passive: true });
    this.media.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        this.select((this.index + (dx < 0 ? 1 : -1) + this.figures.length) % this.figures.length);
      }
    }, { passive: true });

    // übrige Farbbilder im Leerlauf nachladen, damit der Wechsel sofort ist
    const preload = () => this.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
    if ('requestIdleCallback' in window) requestIdleCallback(preload, { timeout: 3000 });
    else setTimeout(preload, 2000);
  }

  select(i) {
    if (i === this.index || !this.figures[i]) return;
    this.index = i;
    this.figures.forEach((f, n) => { f.hidden = n !== i; });
    const fig = this.figures[i];
    this.dots.forEach((d, n) => {
      d.classList.toggle('is-active', n === i);
      d.setAttribute('aria-checked', n === i ? 'true' : 'false');
    });
    if (this.nameEl) this.nameEl.textContent = fig.dataset.name;
    if (this.priceEl) this.priceEl.textContent = fig.dataset.price;
    if (this.cta) this.cta.href = `${this.url}?variant=${fig.dataset.variantId}`;
  }
}
if (!customElements.get('k-hero-picker')) customElements.define('k-hero-picker', KHeroPicker);

class KnuellTotal extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId;
    this.data = JSON.parse(this.querySelector('script[type="application/json"]').textContent);
    this.fmt = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: this.data.currency,
    });
    this.totalEl = this.querySelector('[data-k-total]');
    this.bar = this.querySelector('.k-sticky');
    this.barTotal = this.querySelector('[data-k-bar-total]');
    this.barName = this.querySelector('[data-k-bar-name]');
    this.barBtn = this.querySelector('[data-k-bar-btn]');

    const root = this.closest('product-info') || document;
    this.form = root.querySelector('product-form form') || root.querySelector('form[action*="/cart/add"]');
    this.submit = document.getElementById(`ProductSubmitButton-${this.sectionId}`);
    if (!this.form) return;

    const update = () => this.update();
    this.form.addEventListener('change', update);
    document.addEventListener('input', (e) => { if (e.target.closest?.('.quantity__input')) update(); });
    document.addEventListener('click', (e) => { if (e.target.closest?.('.quantity__button')) setTimeout(update, 0); });
    // Dawn tauscht Variante/Preis per Fetch: auf Änderungen der Formular-ID und des Buttons reagieren
    const idInput = this.form.querySelector('input[name="id"]');
    if (idInput) new MutationObserver(update).observe(idInput, { attributes: true, attributeFilter: ['value'] });
    if (this.submit) {
      new MutationObserver(() => this.syncButton()).observe(this.submit, { attributes: true, childList: true, subtree: true });
    }
    const priceEl = document.getElementById(`price-${this.sectionId}`);
    if (priceEl) new MutationObserver(update).observe(priceEl, { childList: true, subtree: true, characterData: true });
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      subscribe(PUB_SUB_EVENTS.variantChange, () => setTimeout(update, 0));
    }

    // Sticky-Leiste nur zeigen, wenn der echte Button nicht im Bild ist
    if (this.submit && this.bar && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        const below = entry.boundingClientRect.top > 0; // Button liegt unter dem Bildschirm
        this.bar.hidden = entry.isIntersecting || !below;
      }, { threshold: 0.1 }).observe(this.submit);
    }
    if (this.barBtn && this.submit) {
      this.barBtn.addEventListener('click', () => this.submit.click());
    }
    this.update();
  }

  currentId() {
    const input = this.form.querySelector('input[name="id"]');
    return input ? input.value : null;
  }

  qty() {
    const q = document.querySelector(`#Quantity-${this.sectionId}`) || this.form.querySelector('.quantity__input');
    const n = q ? parseInt(q.value, 10) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  update() {
    const v = this.data.variants[this.currentId()];
    if (!v) return;
    const qty = this.qty();
    const text = v.available ? this.fmt.format((v.price * qty) / 100) : 'Ausverkauft';
    if (this.totalEl) this.totalEl.textContent = text;
    if (this.barTotal) this.barTotal.textContent = text;
    if (this.barName) this.barName.textContent = v.title;
    this.querySelector('[data-k-qty]')?.replaceChildren(qty > 1 ? `${qty} × ${this.fmt.format(v.price / 100)}` : '');
    this.syncButton();
  }

  syncButton() {
    if (!this.submit || !this.barBtn) return;
    const label = this.submit.querySelector('span');
    this.barBtn.disabled = this.submit.disabled || this.submit.hasAttribute('disabled');
    const t = (label ? label.textContent : this.submit.textContent).trim();
    if (t) this.barBtn.textContent = t;
  }
}
if (!customElements.get('knuell-total')) customElements.define('knuell-total', KnuellTotal);

/* Eingaben gehen nie verloren: Formulare mit data-k-persist werden in sessionStorage gesichert.
   Die Einwilligung (Checkbox) wird bewusst NICHT wiederhergestellt. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form[data-k-persist]').forEach((form) => {
    const key = `k-form:${form.dataset.kPersist}`;
    const fields = [...form.elements].filter((el) => el.name && !['checkbox', 'radio', 'password', 'hidden', 'submit', 'button'].includes(el.type));
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || '{}');
      fields.forEach((el) => { if (!el.value && saved[el.name]) el.value = saved[el.name]; });
    } catch (e) { /* ohne Speicher weiterarbeiten */ }
    form.addEventListener('input', () => {
      try {
        const data = {};
        fields.forEach((el) => { if (el.value) data[el.name] = el.value; });
        sessionStorage.setItem(key, JSON.stringify(data));
      } catch (e) { /* ignorieren */ }
    });
    // nach erfolgreichem Absenden aufräumen
    if (form.querySelector('.form-status') && !form.querySelector('[role="alert"]')) {
      try { sessionStorage.removeItem(key); } catch (e) { /* ignorieren */ }
    }
  });
});
