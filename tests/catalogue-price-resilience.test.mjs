import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("catalogue card queries keep price_range out of the fatal aggregate request", () => {
  const catalogue = source("lib/magento/catalogue-page.ts");
  const category = source("lib/magento/category-page.ts");

  const catalogueSelection = catalogue.match(/const PRODUCT_SELECTION =[\s\S]*?const CATALOGUE_BROWSE/)?.[0] || "";
  const categorySelection = category.match(/const PRODUCT_CARD_SELECTION =[\s\S]*?const CATEGORY_ROUTE_FIELDS/)?.[0] || "";

  assert.doesNotMatch(catalogueSelection, /price_range/);
  assert.doesNotMatch(categorySelection, /price_range/);
  assert.match(catalogue, /getResilientCataloguePrices/);
  assert.match(category, /getResilientCataloguePrices/);
});

test("catalogue price enrichment isolates a single Magento price failure instead of failing the page", () => {
  const prices = source("lib/magento/catalogue-prices.ts");

  assert.match(prices, /query StoreCataloguePrices/);
  assert.match(prices, /if \(skus\.length === 1\)/);
  assert.match(prices, /return new Map\(\[\[skus\[0\], null\]\]\)/);
  assert.match(prices, /const \[left, right\] = await Promise\.all/);
  assert.match(prices, /fetchPriceBatch\(token, skus\.slice\(0, middle\)\)/);
  assert.match(prices, /fetchPriceBatch\(token, skus\.slice\(middle\)\)/);
});
