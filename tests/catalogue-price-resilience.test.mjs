import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

class MagentoGraphQLError extends Error {
  constructor(message, category, status) {
    super(message);
    this.name = "MagentoGraphQLError";
    this.category = category;
    this.status = status;
  }
}

const internalPriceError = () => new MagentoGraphQLError("Internal server error", undefined, 200);
const price = (sku) => ({
  sku,
  price_range: {
    minimum_price: {
      final_price: { value: 12.5, currency: "GBP" },
      regular_price: { value: 15, currency: "GBP" },
    },
  },
});

function pricesWith(mock) {
  return loadTypeScript(root, "lib/magento/catalogue-prices.ts", {
    "@/lib/magento/client": {
      MagentoGraphQLError,
      magentoGraphQL: mock,
    },
  });
}

test("one price resolver failure leaves the other company-scoped prices intact", async () => {
  const requests = [];
  const prices = pricesWith(async (query, variables, token) => {
    requests.push({ query, variables, token });
    const batch = variables.filter.sku.in;
    if (batch.includes("BROKEN")) throw internalPriceError();
    return { products: { items: batch.map(price) } };
  });

  const result = await prices.getResilientCataloguePrices("buyer-token", ["A", "BROKEN", "C", "D"]);
  assert.equal(result.size, 4);
  assert.equal(result.get("A").minimum_price.final_price.value, 12.5);
  assert.equal(result.get("C").minimum_price.final_price.currency, "GBP");
  assert.equal(result.get("D").minimum_price.regular_price.value, 15);
  assert.equal(result.get("BROKEN"), null);
  assert.equal(requests.length, 5);
  for (const request of requests) {
    assert.match(request.query, /query StoreCataloguePrices/);
    assert.equal(request.token, "buyer-token");
    assert.ok(request.variables.filter.sku.in.every((sku) => ["A", "BROKEN", "C", "D"].includes(sku)));
    assert.equal(request.variables.pageSize, request.variables.filter.sku.in.length);
  }
});

test("a successful price response cannot enrich products outside the returned browse SKUs", async () => {
  const prices = pricesWith(async () => ({
    products: { items: [price("A"), price("FOREIGN")] },
  }));
  const result = await prices.getResilientCataloguePrices("buyer-token", ["A"]);
  assert.equal(result.size, 1);
  assert.equal(result.has("FOREIGN"), false);
});

test("authorization and schema errors never become missing product prices", async () => {
  for (const error of [
    new MagentoGraphQLError("You are not permitted", "graphql-authorization", 200),
    new MagentoGraphQLError('Cannot query field "price_range"', undefined, 200),
    new MagentoGraphQLError("Internal server error", undefined, 500),
    new MagentoGraphQLError("Magento GraphQL is unavailable."),
  ]) {
    const prices = pricesWith(async () => { throw error; });
    await assert.rejects(
      prices.getResilientCataloguePrices("buyer-token", ["A", "B"]),
      (actual) => actual === error,
    );
  }
});

test("system-wide Magento price faults are not hidden as an entire blank-price catalogue", async () => {
  let calls = 0;
  const prices = pricesWith(async () => {
    calls += 1;
    throw internalPriceError();
  });
  await assert.rejects(
    prices.getResilientCataloguePrices("buyer-token", ["A", "B", "C", "D"]),
    /Internal server error/,
  );
  assert.equal(calls, 7);
});

test("many broken prices cannot produce unbounded Magento requests", async () => {
  let calls = 0;
  const prices = pricesWith(async () => {
    calls += 1;
    throw internalPriceError();
  });
  const skus = Array.from({ length: 48 }, (_, index) => "BROKEN-" + index);
  await assert.rejects(
    prices.getResilientCataloguePrices("buyer-token", skus),
    /Internal server error/,
  );
  assert.ok(calls <= 32);
});

test("catalogue and category cards split price requests from company-visible results", () => {
  const catalogue = source("lib/magento/catalogue-page.ts");
  const category = source("lib/magento/category-page.ts");
  const card = source("components/product-card.tsx");

  const browseSelection = catalogue.split("const PRODUCT_SELECTION =")[1]?.split("const CATALOGUE_BROWSE")[0] || "";
  const categorySelection = category.split("const PRODUCT_CARD_SELECTION =")[1]?.split("const CATEGORY_ROUTE_FIELDS")[0] || "";
  assert.doesNotMatch(browseSelection, /price_range/);
  assert.doesNotMatch(categorySelection, /price_range/);
  assert.match(catalogue, /getResilientCataloguePrices\(token, data\.products\.items\.map\(\(product\) => product\.sku\)\)/);
  assert.match(category, /getResilientCataloguePrices\(token, data\.products\.items\.map\(\(product\) => product\.sku\)\)/);
  assert.match(catalogue, /const prices = hidePrice\s+\? null/);
  assert.match(category, /const prices = hidePrice\s+\? null/);
  assert.match(catalogue, /price_range: prices\?\.get\(product\.sku\) \?\? null/);
  assert.match(category, /price_range: prices\?\.get\(product\.sku\) \?\? null/);
  assert.match(card, /!hidePrice && price/);
  assert.match(catalogue, /filter: \{ price: \{ to: "999999999" \} \}/);
});

test("no additional price query is made for customers whose prices are hidden", async () => {
  let lookups = 0;
  const context = loadTypeScript(root, "lib/magento/catalogue-page.ts", {
    "@/lib/magento/client": {
      magentoGraphQL: async () => ({
        customer: { firstname: "A", lastname: "B" },
        css_company_context: { companies: [{ company_id: 1, selected: true, name: "Company" }] },
        css_storefront_policy: { hide_price: true },
        products: { items: [{ uid: "sku-1", sku: "A", name: "A" }], total_count: 1, page_info: { current_page: 1, total_pages: 1 } },
      }),
    },
    "@/lib/magento/catalogue-prices": {
      getResilientCataloguePrices: async () => { lookups += 1; return new Map(); },
    },
  });
  const result = await context.getCataloguePageContext("buyer-token");
  assert.equal(lookups, 0);
  assert.equal(result.hidePrice, true);
  assert.equal(result.products.items[0].price_range, null);
});
