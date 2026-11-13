// Startseite: Status, Tag/Nacht, Ziel-Wort (dehnbar), Winkelmesser-Probe, Termin-Uhr, Tabs, Atem-Minute, Formular.
import { gaugeSvg, SPECS } from './gauge';

const main = document.querySelector<HTMLElement>('[data-home]');
const doc = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <E extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<E>(s);
const $$ = <E extends HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<E>(s)];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

if (main) {
  const T = JSON.parse(main.dataset.t!);

  // ---------- Tag / Nacht ----------
  const themeBtn = $('[data-theme-toggle]')!, themeLabel = $('[data-theme-label]')!;
  const paintTheme = () => {
    const night = doc.dataset.theme === 'nacht';
    themeLabel.textContent = night ? T.nav.day : T.nav.night;
    themeBtn.setAttribute('aria-pressed', String(night));
    $('meta[name="theme-color"]')?.setAttribute('content', night ? '#1c0e14' : '#f6e1da');
  };
  themeBtn.addEventListener('click', () => {
    doc.dataset.theme = doc.dataset.theme === 'nacht' ? 'tag' : 'nacht';
    try { sessionStorage.setItem('wohlauf:theme', doc.dataset.theme!); } catch {}
    paintTheme();
    window.scrollTo({ top: 0 });
    fitWord();
  });
  paintTheme();

  // ---------- Erreichbarkeit (Zeit in Berlin) ----------
  const berlin = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), min: Number(p.hour) * 60 + Number(p.minute), y: Number(p.year), m: Number(p.month), d: Number(p.day) };
  };
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const clock = (s: string) => (T.lang === 'de' ? s.replace(/^0/, '') : s);
  const now = berlin();
  const status = $('[data-status]')!;
  const today = T.hours[now.dow];
  if (today && now.min >= toMin(today[0]) && now.min < toMin(today[1])) { status.textContent = T.status.open.replace('{t}', clock(today[1])); status.dataset.open = '1'; }
  else if (today && now.min < toMin(today[0])) status.textContent = T.status.closedToday.replace('{t}', clock(today[0]));
  else {
    for (let i = 1; i <= 7; i++) {
      const d = (now.dow + i) % 7;
      if (T.hours[d]) { status.textContent = T.status.closedNext.replace('{d}', i === 1 ? T.status.tomorrow : T.status.days[d]).replace('{t}', clock(T.hours[d][0])); break; }
    }
  }

  // ---------- Nächster freier Ersttermin (Beispieldaten aus site.json) ----------
  {
    const dt = new Date(Date.UTC(now.y, now.m - 1, now.d, 12));
    let left = T.slot.inWorkdays;
    while (left > 0) { dt.setUTCDate(dt.getUTCDate() + 1); if (T.hours[dt.getUTCDay()]) left--; }
    const date = new Intl.DateTimeFormat(T.lang === 'de' ? 'de-DE' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dt);
    $('[data-slot]')!.textContent = `${date}, ${T.slot.time}${T.lang === 'de' ? ' Uhr' : ''}`;
  }

  // ---------- Ziel-Wort: zwei Tape-Zeilen, dehnbar ----------
  const word = $('[data-word]')!, sub = $('[data-goal-sub]')!;
  const lines = (w: string) => w.split('|').map((l) => `<span class="word__tape">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('');
  word.innerHTML = lines(T.goals[0].word);
  function fitWord() {
    // Schriftgröße so, dass die breiteste Zeile aller Ziele bei voller Dehnung (wdth 100) in die Spalte passt
    const probe = document.createElement('span');
    probe.className = 'word word--probe';
    probe.innerHTML = T.goals.map((g: any) => lines(g.word)).join('');
    word.parentElement!.append(probe);
    const w = Math.max(...$$('.word__tape', probe).map((e) => e.getBoundingClientRect().width));
    probe.remove();
    const col = word.parentElement!.getBoundingClientRect().width;
    if (w > 0 && col > 0) word.style.setProperty('--fs', Math.min(parseFloat(getComputedStyle(doc).fontSize) * 9.5, innerHeight * (innerHeight < 520 ? 0.16 : 0.24), (100 * col) / w * 0.985).toFixed(1) + 'px');
  }
  fitWord();
  (document as any).fonts?.ready.then(fitWord);
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(fitWord, 120); });

  const chips = $$<HTMLButtonElement>('[data-goal]');
  const setGoal = (id: string, user: boolean) => {
    const g = T.goals.find((x: any) => x.id === id);
    if (!g) return;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.goal === id)));
    const swap = () => { word.innerHTML = lines(g.word); sub.textContent = g.sub; };
    if (reduce || !user) return swap();
    word.classList.add('is-out');
    setTimeout(() => { swap(); word.classList.remove('is-out'); word.classList.add('is-snap'); requestAnimationFrame(() => requestAnimationFrame(() => word.classList.remove('is-snap'))); }, 170);
    try { sessionStorage.setItem('wohlauf:goal', id); } catch {}
  };
  chips.forEach((c) => c.addEventListener('click', () => setGoal(c.dataset.goal!, true)));
  try { const g = sessionStorage.getItem('wohlauf:goal'); if (g) setGoal(g, false); } catch {}

  // Ziehen: Breite der Schrift (wdth 80 → 100), darüber hinaus leichte Dehnung, loslassen federt zurück
  {
    let x0 = 0, active = false;
    const hint = $('[data-pull-hint]');
    const set = (dx: number) => {
      const a = Math.abs(dx), p = clamp(a / 150, 0, 1), over = clamp((a - 150) / 260, 0, 1);
      word.style.setProperty('--wdth', String(80 + 20 * p));
      word.style.setProperty('--sx', String(1 + 0.07 * over));
    };
    word.addEventListener('pointerdown', (e) => { if (e.button) return; active = true; x0 = e.clientX; word.classList.add('is-drag'); word.setPointerCapture?.(e.pointerId); });
    word.addEventListener('pointermove', (e) => { if (active) { set(e.clientX - x0); if (Math.abs(e.clientX - x0) > 30 && hint) hint.dataset.done = '1'; } });
    const end = () => { if (!active) return; active = false; word.classList.remove('is-drag'); word.style.removeProperty('--wdth'); word.style.removeProperty('--sx'); };
    word.addEventListener('pointerup', end);
    word.addEventListener('pointercancel', end);
    word.addEventListener('lostpointercapture', end);
  }

  // ---------- Überschriften dehnen sich einmal beim Erscheinen ----------
  const heads = $$('[data-stretch]');
  if (reduce || !('IntersectionObserver' in window)) heads.forEach((h) => h.classList.add('is-in'));
  else {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
    heads.forEach((h) => io.observe(h));
  }

  // ---------- Winkelmesser zum Anfassen ----------
  {
    const box = $('[data-dial-svg]')!, range = $<HTMLInputElement>('[data-dial-range]')!, hint = $('[data-dial-hint]')!;
    const labels = { l: T.check.left, r: T.check.right };
    const draw = () => { box.innerHTML = gaugeSvg(SPECS.nacken, { l: 71, r: Number(range.value) }, labels, { handle: true, title: T.check.dialLabel }); };
    draw();
    range.addEventListener('input', draw);
    let on = false;
    const at = (e: PointerEvent) => {
      const svg = box.querySelector('svg')!, r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 320 - 160, y = ((e.clientY - r.top) / r.height) * 196 - 172;
      const a = (Math.atan2(x, -y) * 180) / Math.PI;
      range.value = String(Math.round(clamp(a, 4, 90)));
      draw();
      hint.dataset.done = '1';
    };
    box.addEventListener('pointerdown', (e) => { on = true; box.setPointerCapture?.(e.pointerId); at(e); });
    box.addEventListener('pointermove', (e) => { if (on) at(e); });
    const off = () => { on = false; };
    box.addEventListener('pointerup', off);
    box.addEventListener('pointercancel', off);
  }

  // ---------- Erster Termin: Uhr läuft mit dem Scrollen ----------
  {
    const sec = $('[data-termin]')!, ring = sec.querySelector<SVGCircleElement>('[data-clock]')!, n = $('[data-clock-n]', sec)!, tt = $('[data-clock-t]', sec)!;
    const stages = $$('[data-stage]', sec), list = stages[0].parentElement!;
    let raf = 0, cur = -1;
    const tick = () => {
      raf = 0;
      const vh = innerHeight, r = list.getBoundingClientRect();
      const p = clamp((vh * 0.6 - r.top) / r.height, 0, 1);
      ring.style.strokeDashoffset = String(100 - p * 100);
      let ix = 0;
      stages.forEach((s, i) => { if (s.getBoundingClientRect().top < vh * 0.6) ix = i; });
      if (ix !== cur) { cur = ix; n.textContent = String(ix + 1); tt.textContent = stages[ix].dataset.title!; stages.forEach((s, i) => s.classList.toggle('is-now', i === ix)); }
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(tick); };
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', req);
    tick();
  }

  // ---------- Tabs (Kosten) ----------
  $$('[data-tabs]').forEach((box) => {
    const tabs = $$<HTMLButtonElement>('[role=tab]', box);
    const pick = (t: HTMLButtonElement, focus = false) => {
      tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')!)!.hidden = !on; });
      if (focus) t.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => pick(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
  });

  // ---------- Atem-Minute (Nachtansicht) ----------
  {
    const box = $('[data-breath]')!, btn = $<HTMLButtonElement>('[data-breath-btn]')!, w = $('[data-breath-word]')!, msg = $('[data-breath-msg]')!;
    let timers: number[] = [], running = false;
    const stop = (done: boolean) => { timers.forEach(clearTimeout); timers = []; running = false; box.dataset.phase = ''; w.textContent = ''; btn.textContent = T.night.breath; msg.textContent = done ? T.night.breathDone : ''; };
    btn.addEventListener('click', () => {
      if (running) return stop(false);
      running = true; btn.textContent = T.night.breathStop; msg.textContent = '';
      for (let i = 0; i < 6; i++) {
        timers.push(window.setTimeout(() => { box.dataset.phase = 'in'; w.textContent = T.night.breathIn; }, i * 10000 + 50));
        timers.push(window.setTimeout(() => { box.dataset.phase = 'out'; w.textContent = T.night.breathOut; }, i * 10000 + 4000));
      }
      timers.push(window.setTimeout(() => stop(true), 60000));
    });
  }

  // ---------- Sprache wechseln, Stelle behalten ----------
  $$<HTMLAnchorElement>('[data-lang-link]').forEach((a) => a.addEventListener('click', () => { if (location.hash) a.href = a.href.split('#')[0] + location.hash; }));

  // ---------- Anfrage ----------
  {
    const form = $<HTMLFormElement>('[data-af]')!, done = $('[data-af-done]')!, list = $('[data-af-list]')!;
    const F = T.form;
    const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
    const err = (input: HTMLInputElement, show: boolean) => {
      const e = document.getElementById(input.getAttribute('aria-describedby') || '');
      if (e) e.hidden = !show;
      input.setAttribute('aria-invalid', show ? 'true' : 'false');
    };
    // Check-Ergebnis: liegt nur auf diesem Gerät; angehängt wird es erst mit Häkchen
    let resultText = '';
    try {
      const raw = localStorage.getItem('wohlauf:check');
      if (raw) {
        const c = JSON.parse(raw), v = (x: number | null) => (x == null ? '–' : x + '°');
        resultText = T.app.tests.map((t: any) => `${t.h} ${v(c.res[t.id].l)} / ${v(c.res[t.id].r)}`).join(' · ');
        const when = new Intl.DateTimeFormat(T.lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long' }).format(new Date(c.at));
        $('[data-af-result-text]')!.textContent = `${resultText} (${T.app.sideLeft} / ${T.app.sideRight}). ${T.app.savedAt.replace('{d}', when)}`;
        $('[data-af-result]')!.hidden = false;
        if (sessionStorage.getItem('wohlauf:attach') === '1') field('attach').checked = true;
      }
    } catch {}
    ['name', 'tel', 'email'].forEach((n) => field(n).addEventListener('input', () => err(field(n), false)));
    field('privacy').addEventListener('change', () => err(field('privacy'), false));

    const KEY = `form:${location.pathname}:af`;
    const els = () => [...form.elements].filter((el): el is HTMLInputElement => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !!el.name && el.name !== 'privacy');
    const save = () => {
      try {
        const d: Record<string, any> = {};
        els().forEach((el) => {
          if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
          else if (el.type === 'checkbox') { if (el.name === 'time') (d.time ??= []), el.checked && d.time.push(el.value); else d[el.name] = el.checked; }
          else d[el.name] = el.value;
        });
        sessionStorage.setItem(KEY, JSON.stringify(d));
      } catch {}
    };
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        els().forEach((el) => {
          if (!(el.name in d)) return;
          if (el.type === 'radio') el.checked = el.value === d[el.name];
          else if (el.type === 'checkbox') el.checked = el.name === 'time' ? d.time.includes(el.value) : !!d[el.name];
          else el.value = String(d[el.name]);
        });
      }
    } catch {}
    form.addEventListener('input', save);
    form.addEventListener('change', save);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = field('name'), tel = field('tel'), mail = field('email'), priv = field('privacy');
      const bad: HTMLInputElement[] = [];
      const check = (i: HTMLInputElement, ok: boolean) => { err(i, !ok); if (!ok) bad.push(i); };
      check(name, name.value.trim().length > 1);
      check(tel, tel.value.replace(/\D/g, '').length >= 6);
      check(mail, mail.value.trim() === '' || mail.checkValidity());
      check(priv, priv.checked);
      if (bad.length) { bad[0].focus(); return; }
      const val = (n: string) => form.querySelector<HTMLInputElement>(`input[name=${n}]:checked`)?.value ?? '';
      const times = $$<HTMLInputElement>('input[name=time]:checked', form).map((x) => x.value).join(', ');
      const rows: [string, string][] = [[F.rows.area, val('area')], [F.rows.ins, val('ins')]];
      if (times) rows.push([F.rows.time, times]);
      rows.push([F.rows.name, name.value.trim()], [F.rows.tel, tel.value.trim()]);
      if (resultText && field('attach').checked) rows.push([F.rows.result, resultText]);
      list.replaceChildren(...rows.map(([k, v]) => { const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; d.append(dt, dd); return d; }));
      form.hidden = true;
      done.hidden = false;
      done.focus();
      try { sessionStorage.removeItem(KEY); sessionStorage.removeItem('wohlauf:attach'); } catch {}
    });
  }
}
