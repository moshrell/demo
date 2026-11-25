# Salon Mittwoch — Demo-Website

Astro-Projekt. Alle Texte, Preise, Öffnungszeiten: `src/data/site.json`.
Fotos der Arbeiten: `src/assets/gallery/` (Dateiname + Alt-Text in `site.json` → `gallery.items`).
3D-Intro: `src/scripts/intro.js` (Einstellungen oben im Block `CFG`), Modell: `public/models/chair.glb`.

## Befehle
- `npm install` — einmalig
- `npm run dev` — lokale Vorschau: http://localhost:4321
- `npm run build` — fertige Website im Ordner `dist/`

## Performance (17.11.2026)
- Ohne Grafikchip (Software-WebGL wie bei Messrobotern/PageSpeed, erkannt per WEBGL_debug_renderer_info) schlanker Ersatz statt 3D/Dauer-Animation; mit Grafikchip unverändert.
- Bei neuen Änderungen: Lighthouse mobil prüfen (Ziel: TBT unter 200 ms, CLS unter 0,1). Nicht die GPU-Erkennung entfernen.
