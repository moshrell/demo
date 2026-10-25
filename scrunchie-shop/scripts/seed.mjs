#!/usr/bin/env node
/**
 * Knüll: Demo-Daten im Shopify-Testshop anlegen (idempotent, mehrfach ausführbar).
 * Legt an: Produkte (mit Farb-Varianten), Seiten (Recht, Versand, Kontakt), Menüs.
 *
 *   SHOPIFY_STORE=demo-kdd9aj6q.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_... node scripts/seed.mjs
 *
 * Der Token kommt nur aus der Umgebung und wird nie ins Repository geschrieben.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
if (!STORE || !TOKEN) throw new Error('SHOPIFY_STORE und SHOPIFY_ADMIN_TOKEN setzen');
const API = `https://${STORE}/admin/api/2025-10/graphql.json`;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}
function check(label, errs) {
  if (errs && errs.length) throw new Error(`${label}: ${JSON.stringify(errs)}`);
}

const catalog = JSON.parse(await readFile(path.join(root, 'data', 'catalog.json'), 'utf8'));

// --- Veröffentlichungskanal "Online Store"
const pubs = (await gql(`{ publications(first: 20) { nodes { id name } } }`)).publications.nodes;
const onlineStore = pubs.find((p) => /online store|onlineshop/i.test(p.name));

// --- Produkte
for (const p of catalog.products) {
  const input = {
    title: p.title,
    handle: p.handle,
    vendor: catalog.vendor,
    productType: p.productType,
    status: 'ACTIVE',
    descriptionHtml: p.descriptionHtml,
    tags: p.tags,
    seo: { title: p.seoTitle, description: p.seoDescription },
  };
  if (p.colours) {
    input.productOptions = [{ name: 'Farbe', values: p.colours.map((c) => ({ name: c.name })) }];
    input.variants = p.colours.map((c) => ({
      optionValues: [{ optionName: 'Farbe', name: c.name }],
      price: p.price,
      sku: c.sku,
      inventoryPolicy: 'DENY',
      inventoryItem: { tracked: false, requiresShipping: true },
    }));
  } else {
    input.productOptions = [{ name: 'Title', values: [{ name: 'Default Title' }] }];
    input.variants = [{ optionValues: [{ optionName: 'Title', name: 'Default Title' }], price: p.price, sku: p.sku, inventoryItem: { tracked: false, requiresShipping: true } }];
  }
  const r = (await gql(
    `mutation($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
       productSet(synchronous: true, input: $input, identifier: $identifier) {
         product { id handle } userErrors { field message code }
       }
     }`,
    { input, identifier: { handle: p.handle } },
  )).productSet;
  // existiert noch nicht -> Identifier-Fehler: ohne Identifier neu anlegen
  let product = r.product;
  if (!product) {
    if (r.userErrors.some((e) => /not found|does not exist/i.test(e.message))) {
      const r2 = (await gql(
        `mutation($input: ProductSetInput!) { productSet(synchronous: true, input: $input) { product { id handle } userErrors { field message code } } }`,
        { input },
      )).productSet;
      check(`productSet ${p.handle}`, r2.userErrors);
      product = r2.product;
    } else check(`productSet ${p.handle}`, r.userErrors);
  }
  console.log('Produkt:', product.handle, product.id);
  if (onlineStore) {
    const pub = (await gql(
      `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
      { id: product.id, input: [{ publicationId: onlineStore.id }] },
    )).publishablePublish;
    check(`publish ${p.handle}`, pub.userErrors);
  }
}

// --- Seiten
for (const pg of catalog.pages) {
  const body = await readFile(path.join(root, 'data', 'pages', `${pg.handle}.html`), 'utf8');
  const existing = (await gql(`{ pages(first: 100) { nodes { id handle } } }`)).pages.nodes.find((x) => x.handle === pg.handle);
  if (existing) {
    const r = (await gql(
      `mutation($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { userErrors { field message } } }`,
      { id: existing.id, page: { title: pg.title, body, isPublished: true, templateSuffix: pg.template || null } },
    )).pageUpdate;
    check(`pageUpdate ${pg.handle}`, r.userErrors);
  } else {
    const r = (await gql(
      `mutation($page: PageCreateInput!) { pageCreate(page: $page) { page { id } userErrors { field message } } }`,
      { page: { title: pg.title, handle: pg.handle, body, isPublished: true, templateSuffix: pg.template || null } },
    )).pageCreate;
    check(`pageCreate ${pg.handle}`, r.userErrors);
  }
  console.log('Seite:', pg.handle);
}

// --- Menüs
const toItems = (items) => items.map((i) => ({ title: i.title, type: 'HTTP', url: i.url }));
for (const m of catalog.menus) {
  const existing = (await gql(`{ menus(first: 50) { nodes { id handle } } }`)).menus.nodes.find((x) => x.handle === m.handle);
  if (existing) {
    const r = (await gql(
      `mutation($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) { menuUpdate(id: $id, title: $title, items: $items) { userErrors { field message } } }`,
      { id: existing.id, title: m.title, items: toItems(m.items) },
    )).menuUpdate;
    check(`menuUpdate ${m.handle}`, r.userErrors);
  } else {
    const r = (await gql(
      `mutation($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) { menuCreate(title: $title, handle: $handle, items: $items) { userErrors { field message } } }`,
      { title: m.title, handle: m.handle, items: toItems(m.items) },
    )).menuCreate;
    check(`menuCreate ${m.handle}`, r.userErrors);
  }
  console.log('Menü:', m.handle);
}
console.log('Fertig.');
