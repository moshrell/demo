// Общая логика форм (по стандарту OrderForm шаблона): ошибки у полей, автосохранение в sessionStorage
// (согласие не сохраняется и не восстанавливается), очистка после отправки. Ничего не отправляется (демо).
export type Check = [HTMLInputElement | HTMLTextAreaElement, () => boolean];

export function setupForm(form: HTMLFormElement, opts: { checks: () => Check[]; onSubmit: () => void; extraValid?: () => HTMLElement | null }) {
  const KEY = `zf-form:${location.pathname}:${form.id}`;
  const err = (el: HTMLElement, show: boolean) => {
    const id = el.getAttribute('aria-describedby')?.split(' ').find((x) => x.startsWith('err-'));
    const e = id ? document.getElementById(id) : null;
    if (e) e.hidden = !show;
    el.setAttribute('aria-invalid', show ? 'true' : 'false');
    el.closest('.check')?.classList.toggle('is-invalid', show);
  };
  const fields = () => [...form.elements].filter((e): e is HTMLInputElement => (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement) && !!(e as HTMLInputElement).name && (e as HTMLInputElement).name !== 'privacy') as HTMLInputElement[];
  const save = () => {
    try {
      const d: Record<string, string | string[]> = {};
      fields().forEach((el) => {
        if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
        else if (el.type === 'checkbox') { const a = (d[el.name] as string[]) || []; if (el.checked) a.push(el.value); d[el.name] = a; }
        else d[el.name] = el.value;
      });
      sessionStorage.setItem(KEY, JSON.stringify(d));
    } catch {}
  };
  const restore = () => {
    try {
      const d = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (!d) return;
      fields().forEach((el) => {
        if (!(el.name in d)) return;
        if (el.type === 'radio') el.checked = el.value === d[el.name];
        else if (el.type === 'checkbox') el.checked = (d[el.name] as string[]).includes(el.value);
        else el.value = String(d[el.name]);
      });
    } catch {}
  };
  restore();
  form.addEventListener('input', (e) => { save(); const t = e.target as HTMLElement; if (t.getAttribute('aria-invalid') === 'true') err(t, false); });
  form.addEventListener('change', (e) => { save(); const t = e.target as HTMLElement; if (t.getAttribute('aria-invalid') === 'true') err(t, false); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let first: HTMLElement | null = opts.extraValid?.() ?? null;
    for (const [el, ok] of opts.checks()) { const good = ok(); err(el, !good); if (!good && !first) first = el; }
    if (first) { first.focus(); first.scrollIntoView({ block: 'center' }); return; }
    opts.onSubmit();
    try { sessionStorage.removeItem(KEY); } catch {}
  });
  return { save, reset() { form.reset(); try { sessionStorage.removeItem(KEY); } catch {} } };
}
export const telOk = (v: string) => v.replace(/\D/g, '').length >= 6;
export const mailOk = (el: HTMLInputElement) => el.value.trim() === '' || el.checkValidity();
