// Formular-Standard (abgeleitet von _template/OrderForm.astro): Prüfung, Einwilligung, Zwischenspeicher, Bestätigung.
// Es wird nichts gesendet (Demo). Echter Betrieb: Versand per PHP auf All-Inkl, Datenschutz anpassen.

type Field = HTMLInputElement | HTMLTextAreaElement;

export function fehler(input: Field | HTMLElement, show: boolean) {
  const id = input.getAttribute('aria-describedby')?.split(' ').find((x) => x.endsWith('-err'));
  const e = id ? document.getElementById(id) : null;
  if (e) e.hidden = !show;
  input.setAttribute('aria-invalid', show ? 'true' : 'false');
  input.closest('.fm__check')?.classList.toggle('is-invalid', show);
}

/** Pflichtfelder prüfen: data-check="name|tel|mail|mail-opt|text|plz|consent" */
export function pruefen(form: HTMLFormElement, extra: (bad: HTMLElement[]) => void = () => {}): boolean {
  const bad: HTMLElement[] = [];
  form.querySelectorAll<Field>('[data-check]').forEach((f) => {
    const v = f.value.trim();
    const ok = ({
      name: v.length > 1,
      text: v.length > 1,
      tel: v.replace(/\D/g, '').length >= 6,
      mail: v.length > 0 && (f as HTMLInputElement).checkValidity(),
      'mail-opt': v === '' || (f as HTMLInputElement).checkValidity(),
      plz: /^\d{5}$/.test(v),
      consent: (f as HTMLInputElement).checked,
    } as Record<string, boolean>)[f.dataset.check!] ?? true;
    fehler(f, !ok);
    if (!ok) bad.push(f);
  });
  extra(bad);
  if (bad.length) { bad[0].focus(); return false; }
  return true;
}

/** Eingaben nie verlieren: sessionStorage (nur dieser Tab). Einwilligung und Datei werden nie gespeichert. */
export function merken(form: HTMLFormElement, onRestore: () => void) {
  const KEY = `form:${location.pathname}:${form.id}`;
  const els = () => [...form.elements].filter((el): el is Field => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !!el.name && el.name !== 'privacy' && (el as HTMLInputElement).type !== 'file');
  const save = () => {
    try {
      const d: Record<string, string | string[]> = {};
      els().forEach((el) => {
        if (el instanceof HTMLInputElement && el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
        else if (el instanceof HTMLInputElement && el.type === 'checkbox') { d[el.name] = [...((d[el.name] as string[]) || []), ...(el.checked ? [el.value] : [])]; }
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
        if (el instanceof HTMLInputElement && el.type === 'radio') el.checked = el.value === d[el.name];
        else if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = (d[el.name] as string[]).includes(el.value);
        else el.value = String(d[el.name]);
      });
    }
  } catch {}
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  onRestore();
  return { save, clear: () => { try { sessionStorage.removeItem(KEY); } catch {} } };
}

/** Bestätigung mit Zusammenfassung anzeigen, Formular ausblenden */
export function fertig(form: HTMLFormElement, rows: [string, string, boolean?][]) {
  const done = form.parentElement!.querySelector<HTMLElement>('[data-done]')!;
  const list = done.querySelector<HTMLElement>('[data-done-list]')!;
  list.replaceChildren(...rows.filter(([, v]) => v).map(([k, v, strong]) => {
    const d = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    if (strong) d.className = 'is-sum';
    d.append(dt, dd);
    return d;
  }));
  form.hidden = true;
  done.hidden = false;
  done.focus();
  done.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

export const wert = (form: HTMLFormElement, name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? '';
export const gewaehlt = (form: HTMLFormElement, name: string) => [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.dataset.label || i.value);
