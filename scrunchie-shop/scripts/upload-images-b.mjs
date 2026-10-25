#!/usr/bin/env node
/**
 * Knüll Flow (Design B): Fotos aus img-b/ in den Shopify-Shop laden (Quelle: raw.githubusercontent.com, Repo ist öffentlich).
 *   Farbfotos -> Variantenbild je Farbe, Set/Detail -> geteilte Produktbilder, Tabs -> Produkt "Ersatz-Tab",
 *   Schritt-Fotos -> Dateien (shopify://shop_images/<name>), werden in den Theme-Vorlagen verwendet.
 * Mehrfach ausführbar: legt Bilder nur an, wenn das Produkt noch keine Medien hat.
 */
const STORE = process.env.SHOPIFY_STORE, TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('SHOPIFY_STORE und SHOPIFY_ADMIN_TOKEN setzen');
const RAW = 'https://raw.githubusercontent.com/moshrell/demo/main/scrunchie-shop/img-b/';
const API = `https://${STORE}/admin/api/2025-10/graphql.json`;
const gql = async (query, variables = {}) => {
  const j = await (await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN }, body: JSON.stringify({ query, variables }) })).json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
};
const ok = (l, e) => { if (e && e.length) throw new Error(`${l}: ${JSON.stringify(e)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const colours = [
  ['Rosé', 'b-farbe-rose', 'Scrunchie Umhängeband in Rosé, quer getragen'],
  ['Salbei', 'b-farbe-salbei', 'Scrunchie Umhängeband in Salbei, quer getragen'],
  ['Espresso', 'b-farbe-espresso', 'Scrunchie Umhängeband in Espresso, quer getragen'],
  ['Schwarz', 'b-farbe-schwarz', 'Scrunchie Umhängeband in Schwarz, quer getragen'],
];
const shared = [
  ['b-set-flatlay', 'Die Umhängebänder in vier Farben mit Tab und Hülle'],
  ['b-detail-band', 'Nahaufnahme: Satin-Scrunchie und verstellbares Band'],
];
async function product(handle) {
  const d = await gql(`query($h:String!){ productByHandle(handle:$h){ id media(first:50){nodes{id alt status}} variants(first:50){nodes{id title selectedOptions{name value}}} } }`, { h: handle });
  return d.productByHandle;
}
async function addMedia(id, list) {
  const r = (await gql(`mutation($p:ProductUpdateInput!,$m:[CreateMediaInput!]){ productUpdate(product:$p, media:$m){ userErrors{field message} } }`,
    { p: { id }, m: list.map(([file, alt]) => ({ originalSource: RAW + file + '.jpg', alt, mediaContentType: 'IMAGE' })) })).productUpdate;
  ok('productUpdate media', r.userErrors);
}
async function waitReady(handle, n) {
  for (let i = 0; i < 40; i++) {
    const p = await product(handle);
    const nodes = p.media.nodes;
    if (nodes.length >= n && nodes.every((m) => m.status === 'READY')) return p;
    if (nodes.some((m) => m.status === 'FAILED')) throw new Error('Medien-Verarbeitung fehlgeschlagen');
    await sleep(3000);
  }
  throw new Error('Timeout beim Warten auf Medien');
}

// --- Haupt-Produkt
let p = await product('scrunchie-umhaengeband');
if (p.media.nodes.length === 0) {
  await addMedia(p.id, [...colours.map(([, f, a]) => [f, a]), ...shared]);
  p = await waitReady('scrunchie-umhaengeband', colours.length + shared.length);
}
// Variantenbilder zuordnen (Medien tragen den Alt-Text)
const byAlt = Object.fromEntries(p.media.nodes.map((m) => [m.alt, m.id]));
const assign = p.variants.nodes.map((v) => {
  const colour = v.selectedOptions.find((o) => o.name === 'Farbe').value;
  const c = colours.find((x) => x[0] === colour);
  return { id: v.id, mediaId: byAlt[c[2]] };
});
const r = (await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$p, variants:$v){ userErrors{field message} } }`, { p: p.id, v: assign })).productVariantsBulkUpdate;
ok('variant media', r.userErrors);
console.log('Variantenbilder zugeordnet:', assign.length);


// --- Dateien für das Theme (Szenen)
const scenes = [
  ['b-hero-stadt', 'Frau läuft mit Kaffee durch die Stadt, das Handy hängt am Umhängeband'],
  ['b-hero-breit', 'Frau läuft mit Kaffee durch die Stadt, das Handy hängt am Umhängeband'],
  ['b-szene-cafe', 'Frau auf einer Café-Terrasse mit Tablett, Handy am Umhängeband'],
  ['b-szene-rad', 'Mann auf dem Fahrrad, Handy hängt seitlich am Umhängeband'],
  ['b-szene-reise', 'Frau am Bahnsteig mit Koffer, Handy am Umhängeband'],
  ['b-szene-einkauf', 'Frau auf dem Wochenmarkt mit Einkauf, Handy am Umhängeband'],
];
for (const [f, alt] of scenes) {
  const q = (await gql(`query($q:String!){ files(first:1, query:$q){ nodes{ id } } }`, { q: `filename:${f}` })).files.nodes;
  if (q.length) { console.log('Datei vorhanden:', f); continue; }
  const rr = (await gql(`mutation($f:[FileCreateInput!]!){ fileCreate(files:$f){ files{ id } userErrors{field message} } }`, { f: [{ originalSource: RAW + f + '.jpg', alt, contentType: 'IMAGE', filename: f + '.jpg' }] })).fileCreate;
  ok('fileCreate ' + f, rr.userErrors);
  console.log('Datei angelegt:', f);
}
console.log('Fertig.');
