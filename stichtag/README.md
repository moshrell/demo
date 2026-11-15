# Stichtag: Demo für eine Steuerkanzlei (Ollenhauer & Brink, fiktiv)

Vorschau: https://moshrell.github.io/demo/stichtag/ · Brief: `_briefs/kanzlei/01_steuerberater_stichtag.txt`

## Idee
Die Seite ist ein Vordruck (amtliches Formular): echte Zeilennummern, Registerblätter als Navigation, Felder in hellem Grün, Fußzeile als Unterschriftenzeile. Palette A.
Hauptmechanik auf der Startseite: drei Angaben (Rechtsform, Mitarbeitende, Belege pro Monat) → «Ihr Steuerjahr 2027 auf einem Blatt»: Fristen 2027, Vergleich der Abgabefristen mit/ohne Berater, Honorar-Richtwert mit abwählbaren Positionen, Unterlagenliste (druckbar), Link zum Teilen, Übernahme in die Kontaktanfrage. Zustand in URL (`rf, ma, b, ab`) und sessionStorage `stichtag:blatt`. Nichts wird gesendet.
Ohne Auswahl zeigt das Blatt ein Beispiel (GmbH, 6 bis 20, 150 Belege) mit Hinweis.

## Daten
`src/data/*.json`: fristen, honorar (fiktive Beispielzahlen), unterlagen, leistungen, team, wechsel, karriere, faq, optionen, site.
Logik: `src/scripts/blatt-core.ts` (Zustand, Honorar), `blatt.ts` (Startseite), `kontakt.ts` (Übernahme ins Formular).

## Bekannte Lücken / nicht geprüft
- Fristen und Honorar vor einem echten Einsatz fachlich prüfen lassen (Fristen «ohne Gewähr», Honorar «Beispielrechnung»). StBVV: § 14 (Pauschalvergütung) laut Änderung vom 19.12.2025 gestrichen (Quelle buzer.de), am Originaltext verifizieren; Vergütungsvereinbarung in Textform nach § 4.
- Impressum: Registernummer, USt-IdNr., Versicherung, Anschrift sind fiktiv. Echte Kanzlei: Daten vom Kunden (Berufshaftpflicht nach DL-InfoV).
- Wettbewerber-Recherche: pandotax.de und juhn.com ließen sich nicht abrufen.
- Keine Fotos: bei einem echten Kunden Porträts der Partner nötig.
- Visuell von mir nur auf 390x844 (Startseite, Blatt) angesehen; übrige Seiten und Ränder nur mit Zahlen (pagecheck) geprüft. Skip-Link «off-screen» im pagecheck ist gewollt.
- Name/Personen per Websuche auf Dopplungen geprüft (Stand der Recherche); Adresse und Telefon fiktiv.
