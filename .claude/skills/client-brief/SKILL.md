---
name: client-brief
description: Use when Степан provides a client brief (filled by the client or by Gemini as a stand-in) and a site must be built from it; or when a real client's business data, legal info and consent need to be handled.
---

# From brief to site

1. **Parse the brief into `src/data/site.json`** exactly: names, prices, addresses, tone words, colour hex, references, no-gos. Prices and legal data 1:1, never rounded or "improved".
2. **Never invent client facts.** Missing hours, phone, register number, allergen data, photos → leave visible `TODO` in code/data and list them in the report. Fictional demo businesses are allowed only when marked as demo.
3. **Respect the no-go list literally** (e.g. no stock bakers, no rustic textures, no popups). Check the finished page against it.
4. **Legal checklist (Germany):** Impressum (§ 5 DDG: name, legal form, address, contact, USt-IdNr., register if any), Datenschutz page placeholder, no external requests/trackers, allergens for food (list from client, don't guess), written permission before showing a real business's brand/logo/photos in a demo (Markenrecht, Urheberrecht, Persönlichkeitsrecht).
5. **Payments/booking:** a static Astro site cannot take payments. Offer: payment link (Stripe/Mollie), or form → e-mail now and integration at go-live. Say this plainly in the report; it is a priced extra for the client.
6. **Report format** (short): what was built from which brief point, what is missing from the client (list), what is placeholder/example (e.g. time slots), next step.
7. If Степан says "imagine this is for a client", build as for a real client but keep it in the portfolio as a fictional demo unless he says otherwise.
