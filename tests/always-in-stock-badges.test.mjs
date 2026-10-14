import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const badges = loadTypeScript(root, "lib/product-badges.ts");

test("always_in_stock accepts Magento yes/no values and rejects unset/false", () => {
  for (const value of ["1", 1, true, "true", "YES", "enabled"]) {
    assert.equal(badges.isProductBadgeEnabled({ always_in_stock: value }, "always_in_stock"), true);
  }
  for (const value of ["0", 0, false, null, undefined, ""]) {
    assert.equal(badges.isProductBadgeEnabled({ always_in_stock: value }, "always_in_stock"), false);
  }
});

test("always in stock is independent of delivery features", () => {
  const active = Array.from(badges.getActiveProductBadgeCodes({
    ppe_certified: true, fast_delivery: true, always_in_stock: true,
  }));
  assert.ok(active.includes("always_in_stock"));
  assert.ok(active.includes("fast_delivery"));
  const express = Array.from(badges.getActiveProductBadgeCodes({
    express_delivery: true, fast_delivery: true, always_in_stock: true,
  }));
  assert.ok(express.includes("always_in_stock"));
  assert.ok(express.includes("express_delivery"));
  assert.ok(!express.includes("fast_delivery"));
});

test("one deferred badge request supplies both the image overlay and feature chips", () => {
  const gql = source("lib/magento/product-badges.ts");
  const provider = source("components/catalogue-badges.tsx");
  const card = source("components/product-card.tsx");
  const pdp = source("app/product/[sku]/page.tsx");
  const deferred = source("components/deferred-product-badges.tsx");

  assert.match(gql, /always_in_stock/);
  assert.match(gql, /LEGACY_PRODUCT_BADGES/);
  assert.match(gql, /Cannot query field/);
  assert.match(provider, /isProductBadgeEnabled\(deferred \|\| initialValues, "always_in_stock"\)/);
  assert.match(card, /<CatalogueStockOverlay sku=\{product\.sku\}/);
  assert.match(pdp, /<CatalogueBadgeProvider skus=\{\[product\.sku\]\}>/);
  assert.match(pdp, /overlay=\{<CatalogueStockOverlay/);
  assert.doesNotMatch(deferred, /fetch\(/);
});

test("compact card chips prioritize delivery plus the stock promise", () => {
  const chips = source("components/product-badges.tsx");
  assert.match(chips, /PackageCheck/);
  assert.match(chips, /always_in_stock: \{ label: "Always in stock", Icon: PackageCheck \}/);
  assert.match(chips, /codes\.includes\("always_in_stock"\)/);
  assert.match(chips, /\[deliveryCode, "always_in_stock" as const\]/);
});

test("overlay is positioned over but does not replace the product image", () => {
  const css = source("app/product-badges.css");
  const gallery = source("components/product-gallery.tsx");
  assert.match(css, /background: url\("\/always-in-stock\.png"\)/);
  assert.match(css, /pointer-events: none/);
  assert.match(gallery, /active && !failed \? overlay : null/);
});
