// Startseite: Status, Tag/Nacht, Körper-Tafel (Liste steuert, 3D-Figur zeigt), Tabs, Formular.
const main = document.querySelector<HTMLElement>('[data-home]');
const doc = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <E extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<E>(s);
const $$ = <E extends HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<E>(s)];

if (main) {
  const T = JSON.parse(main.dataset.t!);

  // ---------- Tag / Nacht (Knopf im Menü) ----------
  const themeBtn = $('[data-theme-toggle]')!, themeLabel = $('[data-theme-label]')!;
  const paintTheme = () => {
    const night = doc.dataset.theme === 'nacht';
    themeLabel.textContent = night ? T.nav.day : T.nav.night;
    themeBtn.setAttribute('aria-pressed', String(night));
  };
  themeBtn.addEventListener('click', () => {
    doc.dataset.theme = doc.dataset.theme === 'nacht' ? 'tag' : 'nacht';
    try { sessionStorage.setItem('wohlauf:theme', doc.dataset.theme!); } catch {}
    paintTheme();
    closeMenu();
    window.scrollTo({ top: 0 });
  });
  paintTheme();

  // ---------- Menü (Sprossenwand) ----------
  const wand = $('[data-menu]')!, menuBtn = $<HTMLButtonElement>('[data-menu-open]')!;
  function closeMenu() { if (wand.hidden) return; wand.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); doc.classList.remove('is-menu'); menuBtn.focus({ preventScroll: true }); }
  menuBtn.addEventListener('click', () => { wand.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); doc.classList.add('is-menu'); $<HTMLButtonElement>('[data-menu-close]')!.focus(); });
  $('[data-menu-close]')!.addEventListener('click', closeMenu);
  $$('[data-menu-link]').forEach((a) => a.addEventListener('click', () => { wand.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); doc.classList.remove('is-menu'); }));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // ---------- Winkelmesser: der Zeiger zeigt, wie weit die Seite gelesen ist ----------
  {
    const needle = document.querySelector<SVGLineElement>('[data-needle]')!;
    let raf = 0;
    const turn = () => { raf = 0; const max = doc.scrollHeight - innerHeight; const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0; needle.setAttribute('transform', `rotate(${(-90 + 180 * p).toFixed(1)} 32 32)`); };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(turn); }, { passive: true });
    turn();
  }

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

  // ---------- Körper-Tafel ----------
  const form = $<HTMLFormElement>('[data-af]')!;
  {
    const chart = $('[data-chart]')!, map = $('[data-map]')!, fig = $('[data-figure]')!, canvas = $<HTMLCanvasElement>('[data-canvas]')!, svg = map.querySelector<SVGSVGElement>('[data-lines]')!;
    const labels = $$<HTMLAnchorElement>('[data-zone]', chart), panels = $$('[data-zone-panel]', chart), empty = $('[data-panel-empty]')!, panel = $('[data-panel]')!;
    const faces = $$<HTMLButtonElement>('[data-face]', chart);
    let body: Awaited<ReturnType<typeof import('./body').createBody>> | null = null;
    let current: string | null = null;
    chart.classList.add('is-live'); // ab jetzt zeigt das Feld nur die gewählte Region
    const paintFace = (back: boolean) => faces.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.face === 'back') === back)));
    const select = (id: string | null, fromUser = true) => {
      current = id;
      labels.forEach((l) => l.setAttribute('aria-pressed', String(l.dataset.zone === id)));
      panels.forEach((p) => (p.hidden = p.dataset.zonePanel !== id));
      empty.hidden = !!id;
      body?.select(id);
      const z = T.zones.find((x: any) => x.id === id);
      if (z) paintFace(z.view === 'back');
      drawLines();
      paintPeek();
    };
    // Handy: das Feld liegt unter der Figur. Statt wegzurollen (dann sähe man die Markierung nicht), erscheint ein Hinweis über der Aktionsleiste.
    const peek = $<HTMLAnchorElement>('[data-peek]')!, peekName = $('[data-peek-name]')!;
    function paintPeek() {
      const show = !!current && panel.getBoundingClientRect().top > innerHeight * 0.78;
      if (show) peekName.textContent = T.names[current!];
      peek.hidden = !show;
    }
    addEventListener('scroll', paintPeek, { passive: true });
    addEventListener('resize', paintPeek);
    panels.forEach((p) => (p.hidden = true));
    labels.forEach((l) => {
      l.addEventListener('click', (e) => { e.preventDefault(); select(l.dataset.zone === current ? null : l.dataset.zone!); });
      l.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); l.click(); } });
    });
    faces.forEach((b) => b.addEventListener('click', () => { body?.face(b.dataset.face as 'front' | 'back'); paintFace(b.dataset.face === 'back'); }));

    $$<HTMLAnchorElement>('[data-goto-zone]').forEach((a) => a.addEventListener('click', () => { if (current !== a.dataset.gotoZone) select(a.dataset.gotoZone!); }));
    // Terminwunsch aus dem Feld ins Formular übernehmen
    $$<HTMLAnchorElement>('[data-ask]').forEach((a) => a.addEventListener('click', () => {
      const sel = form.elements.namedItem('area') as HTMLSelectElement;
      if (a.dataset.ask) sel.value = a.dataset.ask;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }));

    // Hinweislinien von den Namen zur Figur (aus den projizierten 3D-Punkten)
    let pts: Record<string, [number, number, boolean]> = {};
    const NS = 'http://www.w3.org/2000/svg';
    const lines = Object.fromEntries(labels.map((l) => { const g = document.createElementNS(NS, 'g'); g.innerHTML = '<path/><circle r="3.5"/>'; svg.append(g); return [l.dataset.zone!, g]; }));
    function drawLines() {
      const mr = map.getBoundingClientRect(), fr = fig.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${mr.width} ${mr.height}`);
      labels.forEach((l) => {
        const id = l.dataset.zone!, g = lines[id], p = pts[id];
        if (!p) { g.style.display = 'none'; return; }
        g.style.display = '';
        const lr = l.getBoundingClientRect(), x1 = lr.right - mr.left, y1 = lr.bottom - mr.top - 1, x2 = p[0] + fr.left - mr.left, y2 = p[1] + fr.top - mr.top;
        const mx = x1 + Math.max(10, (x2 - x1) * 0.35);
        g.firstElementChild!.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}H${mx.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
        const c = g.lastElementChild!; c.setAttribute('cx', x2.toFixed(1)); c.setAttribute('cy', y2.toFixed(1));
        g.setAttribute('class', `${id === current ? 'is-on' : ''} ${p[2] ? '' : 'is-far'}`);
      });
    }

    const start = async () => {
      try {
        const { createBody } = await import('./body');
        const css = getComputedStyle(doc);
        body = await createBody({
          canvas, model: T.model, zones: T.zones, reduce, skin: css.getPropertyValue('--fig-skin').trim(), hot: css.getPropertyValue('--fig-hot').trim(), cloth: css.getPropertyValue('--fig-cloth').trim(), eye: css.getPropertyValue('--fig-eye').trim(),
          onPick: (id) => select(id),
          onFrame: (project) => {
            // Ankerpunkt je Region: das Kapselende, das auf dem Bildschirm am weitesten links liegt (zur Namensliste hin)
            for (const z of T.zones) {
              let best: [number, number, boolean] | null = null;
              for (const c of z.caps) { const p = project([c[0], c[1], c[2]]); if (!best || p[0] < best[0]) best = p; }
              pts[z.id] = best!;
            }
            drawLines();
            paintFaceQuiet();
          },
        });
        fig.classList.add('is-ready');
        (window as any).__body = body;
        if (current) body.select(current);
      } catch (e) { fig.classList.add('is-failed'); }
    };
    let lastBack = false;
    const paintFaceQuiet = () => { const b = body!.isBack(); if (b !== lastBack) { lastBack = b; paintFace(b); } };
    canvas.addEventListener('pointerdown', () => { const h = $('[data-drag-hint]'); if (h) h.dataset.done = '1'; }, { once: true });
    addEventListener('resize', drawLines);
    if ('requestIdleCallback' in window) (window as any).requestIdleCallback(start, { timeout: 1200 }); else setTimeout(start, 200);
    const hash = location.hash.match(/^#z-(\w+)$/);
    if (hash) select(hash[1], false);
  }

  // ---------- Rezept: Kürzel antippen, Fristen aus dem heutigen Datum ----------
  {
    const btns = $$<HTMLButtonElement>('[data-rx-btn]'), items = $$('[data-rx]');
    btns.forEach((b) => b.addEventListener('click', () => {
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      items.forEach((x) => x.classList.toggle('is-on', x.dataset.rx === b.dataset.rxBtn));
    }));
    const fmt = new Intl.DateTimeFormat(T.lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    const d0 = new Date(Date.UTC(now.y, now.m - 1, now.d, 12)), d1 = new Date(d0); d1.setUTCDate(d1.getUTCDate() + 28);
    $('[data-rx-issued]')!.textContent = fmt.format(d0);
    $('[data-rx-start]')!.textContent = fmt.format(d1);
  }

  // ---------- Kosten: Rechner mit Quittung ----------
  {
    const box = $('[data-calc]')!, tabs = $$<HTMLButtonElement>('[data-way]', box), lines = $('[data-bon-lines]')!, sum = $('[data-bon-sum]')!, note = $('[data-bon-note]')!;
    const eur = new Intl.NumberFormat(T.lang === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency: 'EUR' });
    const n: Record<string, number> = { kasse: 6, selbst: 1 };
    let way = 'kasse';
    const row = (k: string, v: string) => { const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; d.append(dt, dd); return d; };
    const paint = () => {
      const C = T.calc;
      if (way === 'kasse') {
        const k = (box.querySelector<HTMLInputElement>('input[name=kheil]:checked')!).value, p = T.kasse[k], share = 0.1 * n.kasse * p;
        lines.replaceChildren(row(C.fee, eur.format(T.fee)), row(`${C.share}: ${n.kasse} × ${k} (${eur.format(p)})`, eur.format(share)));
        sum.textContent = eur.format(T.fee + share); note.textContent = C.kasseNote;
      } else if (way === 'selbst') {
        const it = T.list[Number((box.querySelector<HTMLInputElement>('input[name=sleist]:checked')!).value)];
        if (it.pack) n.selbst = 1;
        lines.replaceChildren(row(`${n.selbst} × ${it.n}, ${it.d}`, eur.format(n.selbst * it.v)));
        sum.textContent = eur.format(n.selbst * it.v); note.textContent = C.selbstNote;
        const st = box.querySelector<HTMLElement>('[data-step="selbst"]')!; st.classList.toggle('is-off', !!it.pack);
        st.querySelectorAll('button').forEach((b) => (b.disabled = !!it.pack));
      } else {
        lines.replaceChildren(row(C.privatLine, C.privatVal));
        sum.textContent = C.privatSum; note.textContent = '';
      }
      $$('[data-step]', box).forEach((s) => { $('[data-step-val]', s)!.textContent = String(n[s.dataset.step!]); });
    };
    const pick = (t: HTMLButtonElement, focus = false) => {
      way = t.dataset.way!;
      tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')!)!.hidden = !on; });
      if (focus) t.focus();
      paint();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => pick(t));
      t.addEventListener('keydown', (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); } });
    });
    $$('[data-step]', box).forEach((s) => {
      const id = s.dataset.step!;
      $('[data-step-dec]', s)!.addEventListener('click', () => { n[id] = Math.max(1, n[id] - 1); paint(); });
      $('[data-step-inc]', s)!.addEventListener('click', () => { n[id] = Math.min(id === 'kasse' ? 18 : 12, n[id] + 1); paint(); });
    });
    box.addEventListener('change', paint);
    $('[data-bon-ask]')!.addEventListener('click', () => {
      const ix = { kasse: 0, privat: 1, selbst: 2 }[way]!;
      const r = form.querySelectorAll<HTMLInputElement>('input[name=ins]')[ix];
      r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    paint();
  }

  // ---------- Sprache wechseln, Stelle behalten ----------
  $$<HTMLAnchorElement>('[data-lang-link]').forEach((a) => a.addEventListener('click', () => { if (location.hash) a.href = a.href.split('#')[0] + location.hash; }));

  // ---------- Anfrage ----------
  {
    const done = $('[data-af-done]')!, list = $('[data-af-list]')!;
    const F = T.form;
    const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
    const err = (input: HTMLInputElement, show: boolean) => {
      const e = document.getElementById(input.getAttribute('aria-describedby') || '');
      if (e) e.hidden = !show;
      input.setAttribute('aria-invalid', show ? 'true' : 'false');
    };
    ['name', 'tel', 'email'].forEach((n) => field(n).addEventListener('input', () => err(field(n), false)));
    field('privacy').addEventListener('change', () => err(field('privacy'), false));

    const KEY = `form:${location.pathname}:af`;
    type El = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const els = () => [...form.elements].filter((el): el is El => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) && !!el.name && el.name !== 'privacy');
    const save = () => {
      try {
        const d: Record<string, any> = {};
        els().forEach((el) => {
          const i = el as HTMLInputElement;
          if (i.type === 'radio') { if (i.checked) d[i.name] = i.value; }
          else if (i.type === 'checkbox') { (d.time ??= []), i.checked && d.time.push(i.value); }
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
          const i = el as HTMLInputElement;
          if (!(el.name in d)) return;
          if (i.type === 'radio') i.checked = i.value === d[i.name];
          else if (i.type === 'checkbox') i.checked = d.time.includes(i.value);
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
      const rows: [string, string][] = [[F.rows.area, field('area').value], [F.rows.ins, val('ins')]];
      if (times) rows.push([F.rows.time, times]);
      rows.push([F.rows.name, name.value.trim()], [F.rows.tel, tel.value.trim()]);
      list.replaceChildren(...rows.map(([k, v]) => { const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; d.append(dt, dd); return d; }));
      form.hidden = true;
      done.hidden = false;
      done.focus();
      try { sessionStorage.removeItem(KEY); } catch {}
    });
  }
}
