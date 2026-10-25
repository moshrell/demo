/* Knüll Flow: Einblenden beim Scrollen und Fortschrittsbalken der Szenen. Ohne Abhängigkeiten. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function init() {
    if (!reduce && 'IntersectionObserver' in window) {
      document.documentElement.classList.add('kf-js');
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      document.querySelectorAll('[data-reveal]').forEach(function (el) {
        // Was schon im Bild ist, bleibt sichtbar (kein Flackern beim Laden)
        if (el.getBoundingClientRect().top > window.innerHeight * 0.9) { el.classList.add('kf-pre'); io.observe(el); }
      });
    }
    document.querySelectorAll('.kf-scenes').forEach(function (sec) {
      var rail = sec.querySelector('.kf-scenes__rail');
      var bar = sec.querySelector('.kf-scenes__bar i');
      if (!rail || !bar) return;
      var upd = function () {
        var max = rail.scrollWidth - rail.clientWidth;
        var visible = rail.clientWidth / rail.scrollWidth;
        var p = max > 0 ? visible + (1 - visible) * (rail.scrollLeft / max) : 1;
        bar.style.setProperty('--p', p.toFixed(3));
        bar.parentNode.style.setProperty('--p', p.toFixed(3));
      };
      rail.addEventListener('scroll', function () { requestAnimationFrame(upd); }, { passive: true });
      window.addEventListener('resize', upd);
      upd();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
