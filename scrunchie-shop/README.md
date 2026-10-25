# Knüll: Shopify-Demo für Scrunchie Phone Strap

Demo-Shop für eine mögliche Kundin, die Scrunchie-Handybänder verkaufen will. Marke **Knüll** ist erfunden (Demo). Technik: Shopify-Theme auf Basis von Dawn 16 (MIT), Liquid, ohne Build-Schritt.

## Ordner
| Pfad | Inhalt |
|---|---|
| `theme/` | das Shopify-Theme (Dawn + Knüll-Schicht) |
| `data/catalog.json`, `data/pages/*.html` | Produkte, Seiten, Menüs für den Testshop |
| `scripts/seed.mjs` | legt Produkte, Seiten, Menüs per Admin-API an (Token nur aus der Umgebung) |
| `PROMPTS.txt` | 12 Gemini-Prompts für alle Fotos |
| `img/` | fertige Fotos (Quelle der Wahrheit, werden in den Shop hochgeladen) |

## Testshop
- Shop: `demo-kdd9aj6q.myshopify.com` (Partner-Dev-Store, Passwortschutz an, keine echten Zahlungen, Test-Gateway "bogus")
- Theme "Knüll" ist **nicht veröffentlicht**: Vorschau über Theme-Editor oder `?preview_theme_id=<ID>`
- Hochladen: `shopify theme push --path scrunchie-shop/theme --store demo-kdd9aj6q.myshopify.com --theme <ID>` (in der Cloud-Sitzung, Login per Gerätecode)

## Nutzerlogik (warum die Seite so aufgebaut ist)
1. Startseite: Farbe direkt im Hero wählen (Punkte, Wischen), Preis und Button wechseln mit, Button führt zur Produktseite mit dieser Farbe.
2. Vertrauen in einer Zeile (Versand, Rückgabe, passt zu jedem Handy).
3. Farbübersicht (jede Kachel = Farbe + Preis), dann "So funktioniert's" in 3 Schritten, dann FAQ. Die wichtigste Kundenfrage "Passt das zu meinem Handy / wie hält das?" wird in Hero, Produktseite und FAQ beantwortet.
4. Produktseite: Farbe, Menge, **Summe live**, Button; auf dem Handy erscheint eine feste Leiste mit Summe und Button, sobald der Button aus dem Bild scrollt.
5. Warenkorb: Fortschrittsbalken bis zum kostenlosen Versand (Schwelle in den Theme-Einstellungen), Preis- und Rechtshinweise direkt beim Kassen-Button.
6. Kontaktformular mit Beispielen in den Feldern, Pflicht-Einwilligung mit Link zur Datenschutzerklärung (öffnet in neuem Tab), Eingaben bleiben per sessionStorage erhalten.

## Bekannte Annahmen und offene Punkte (für Claude-Chats, die hier weiterarbeiten)
- **Produktfakten sind Demo-Annahmen** und müssen mit der echten Kundin geklärt werden: Aufbau (Scrunchie-Band + flacher Tab zwischen Handy und Hülle), Material, Umfang ca. 20 cm, Preis 24,90 €, 6 Farben, kostenloser Versand ab 40 €, Lieferzeit 1–3 Werktage, 14 Tage Rückgabe. Keine Tragkraft-Zahlen genannt (Sicherheitsaussage nur mit Prüfung).
- **Rechtstexte sind Gerüste** mit Platzhaltern in `[eckigen Klammern]`. Vor Livegang durch Daten der Betreiberin und einen geprüften Text ersetzen (IT-Recht Kanzlei, Händlerbund o. ä.). Impressum nach § 5 DDG.
- **Shop-Sprache muss Deutsch sein** (Settings → Languages → Standardsprache), sonst ist der Checkout englisch. Das Theme liefert deutsche Texte als Standard (`locales/en.default.json` ist eine Kopie von `de.json`).
- **Checkout** (Shopify-eigen) anpassen unter Settings → Checkout: Button-Text "Zahlungspflichtig bestellen" kommt von Shopify je nach Sprache; Pflichtfelder und Kundenkonten prüfen.
- **Cookie-Banner**: in Shopify unter Settings → Customer privacy einschalten. Das Theme setzt selbst keine Tracker.
- Schriften (Fraunces, Figtree) liegen lokal im Theme (`assets/knuell-*.woff2`), werden aber über das Shopify-CDN ausgeliefert. Das gehört zur Shopify-Infrastruktur und steht in der Datenschutzerklärung.
- Kundenkonto-Symbol und Suche in der Kopfzeile sind per Theme-Einstellung ausgeblendet (bei 2 Produkten nur Ablenkung).
- Variantenbilder: pro Farbe genau ein Foto (Variantenbild), dazu geteilte Bilder (Set, Detail). Mehrere Fotos je Farbe würden alle Farben im Bildkarussell mischen (Shopify-Eigenheit, `hide_variants`).
- Fotos: alle 12 sind da (`img/`) und im Shop.
- Preisformat: Shopify zeigt `€24,90` (Shop-Einstellung). Deutsch üblich ist `24,90 €`: Settings → General → Store currency → Change formatting → "HTML with currency" `{{amount_with_comma_separator}} €`.
- Skripte: `seed.mjs` (Produkte, Seiten, Menüs) und `upload-images.mjs` (Fotos), beide mit `SHOPIFY_STORE` und `SHOPIFY_ADMIN_TOKEN` aus der Umgebung. Token über Dev-Dashboard-App (Client ID und Secret, `grant_type=client_credentials`, 24 h gültig).


## Design B: «Knüll Flow» (`theme-b/`)
- Zweites Theme im selben Shop (unveröffentlicht), eigene Startseite: Hero mit bewegten Farbfeldern, die die Bandfarbe annehmen; Lauftext; großes Szenenfoto; Szenen zum Wischen; «Drei Griffe» als Zahlen mit Linie (ohne Schritt-Fotos); Produktkarten Hals/Handgelenk; FAQ; Abschluss.
- Hauptprodukt: **Scrunchie Umhängeband** (`scrunchie-umhaengeband`, 4 Farben, 29,90 €, Preis und Länge sind Demo-Annahmen; Maße vom Hersteller: TODO). In Theme A erscheint es nur im Katalog.
- Schrift Bricolage Grotesque + DM Sans (lokal, `assets/kflow-*.woff2`), Palette Creme/Tinte/Koralle, Pastellfelder.
- Fotos: `PROMPTS-B.txt` (12 Stück) -> `img-b/`, dann `node scripts/upload-images-b.mjs` und die `shopify://shop_images/b-…`-Verweise in `theme-b/templates/index.json` (Szene, Szenen-Karten) setzen. Bis dahin zeigen die Rahmen Farbverläufe.
- Kein Umschalter auf der Seite: A und B sind getrennte Vorschau-Links (`?preview_theme_id=`).
- Animationen sind reine CSS-Transformationen; bei «Bewegung reduzieren» (Systemeinstellung) stehen sie still.
