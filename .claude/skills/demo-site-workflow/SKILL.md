---
name: demo-site-workflow
description: Use when starting, building, checking, or publishing any demo or client website in D:\Webdesign (new project folder, Astro setup, CSP/htaccess, publish into kravets-site portfolio, writing files to Степан's PC).
---

# Demo/Client site workflow (D:\Webdesign)

## 1. New project = new folder from `_template`
Every project lives in its own folder directly in `D:\Webdesign`. Never inside another project, never in `D:\salon1` (retired).

1. Name: `<slug>` in kebab-case (`artisanal-bakery`, `salon-nelke`). Category in German as in the portfolio (`friseur`, `cafe`, `handwerk`, `auto`, `dienstleistung`).
2. Copy: `cp -r _template <slug>` then replace `__SLUG__`, `__CATEGORY__`, `__NAME__` in every file (not in node_modules):
   `grep -rl "__SLUG__\|__CATEGORY__\|__NAME__" <slug> | xargs sed -i 's/__SLUG__/<slug>/g; s/__CATEGORY__/<cat>/g; s/__NAME__/<Name>/g'`
3. The demo URL is `/vorschau/<category>/<slug>/` (base path in `astro.config.mjs`). All asset URLs must use `import.meta.env.BASE_URL`.

## 2. Design process (do not skip, this is where quality comes from)
- Read `frontend-design` and `hallmark` skills BEFORE touching layout. Decide concept first: emotion the visitor buys → structure → visuals → only then code.
- Each demo must differ from the others in page STRUCTURE, not only colours (see existing: Mittwoch = 3D chair intro, Nelke = SVG shop window, Kamm = booking app, Nuance = floating paint blobs, Artisanal = scroll-baked croissant).
- Premium bar: custom type pairing, one big idea, real micro-detail, mobile first (375 px), WCAG AA contrast, no stock-template feel. Do not ship a first draft; critique it against the brief and fix before showing.
- KI-Kennzeichnung (Pflicht, automatisch): `npm run build` ruft `scripts/ki-hinweis.mjs` auf — es hängt jeder Seite des Demos die Plakette „Beispielseite von Kravets Webdesign · Betrieb und Personen erfunden · Bilder teils KI-erzeugt“ an (+ `ki-hinweis.css`). Schritt nicht aus dem build-Skript entfernen. Für schon veröffentlichte Demos: `node scripts/ki-hinweis.mjs <Ordner>` (idempotent). Echte Kunden: KI-Bilder/-Texte nur mit seinem Wissen, dann kennzeichnen (Text anpassen). Texte für kravets-site: `site.ts` → `ai`.
- Content: data lives in `src/data/*.json`, never hard-coded in markup. Fonts via `@fontsource*` (local, no external requests, DSGVO). No external CDNs, no trackers, no embedded Google Maps (use a link).

## 3. CSP / publish
- `npm run build` runs `scripts/htaccess.mjs`: it hashes all inline `<script>`/`<style>`/`style=""` and writes `dist/.htaccess` (own CSP + noindex). If a project needs WASM add `'wasm-unsafe-eval'`, for blobs `blob:` in `img-src`/`worker-src`, edit that script, don't loosen with `unsafe-inline`.
- `npm run publish` builds and copies `dist` to `..\kravets-site\public\vorschau\<category>\<slug>`.
- Then in `kravets-site`: add entry in `src/config/works.ts` (+ preview `public/works/<slug>.webp`, 16:10), commit right away. `git push` is done by Степан (cloud session has no GitHub credentials) — give him the exact command.

## 4. Checks (no screenshots unless Степан asks)
- `npx astro build` must pass. Headless numeric checks are fine: Playwright with `--use-gl=swiftshader --use-angle=swiftshader --enable-unsafe-swiftshader`, read console errors, horizontal overflow, computed contrast, pixel means. Do not open or send images.
- Before saying "done": grep for leftover `TODO`/placeholder, check all links under base path, check reduced-motion and no-WebGL fallbacks.

## 5. Working on Степан's PC (remote-devices tools)
- Connected root is `D:\`; in `device_bash` it appears as `$HOME/mnt/d/`. Work in `$HOME/mnt/d/Webdesign/<slug>`.
- AVOID `du`/`find` over `node_modules` (times out). Use `ls`, targeted globs, `--exclude=node_modules`.
- `device_commit_files` to an EXISTING path silently keeps the old file. Always use a fresh file name for uploads, extract with `tar` into a NEW directory, verify with `grep`. Overwriting existing project files: edit in place with `python3`/`sed` via device_bash instead.
- Deleting needs `device_request_delete_permission` (once per session, per connected root).
- Windows may block writes to some folders; a running dev server locks files. If a step needs him to stop the dev server, say so, ask, WAIT, then continue.
- Never run npm/node on the VM for his project (Linux binaries would corrupt `node_modules`); he runs `START.bat`. Build and test in the cloud sandbox copy (`/home/claude/<slug>`), then ship source (without node_modules/dist/.astro).
- Never touch `D:\mizgin` (closed for good).
