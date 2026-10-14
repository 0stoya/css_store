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

test("Magento badge lookup loads the new attribute without changing delivery flags", async () => {
  const requests = [];
  const query = loadTypeScript(root, "lib/magento/product-badges.ts", {
    "@/lib/magento/client": {
      MagentoGraphQLError: class MagentoGraphQLError extends Error {},
      magentoGraphQL: async (document, variables, token) => {
        requests.push({ document, variables, token });
        return { products: { items: [{
          sku: "STOCK-YES", always_in_stock: 1, fast_delivery: 1, express_delivery: 0,
        }] } };
      },
    },
  });

  const result = await query.getProductBadgeValues("customer-token", ["STOCK-YES"]);
  assert.equal(requests.length, 1);
  assert.match(requests[0].document, /always_in_stock/);
  assert.equal(requests[0].token, "customer-token");
  assert.equal(result.get("STOCK-YES")?.always_in_stock, 1);
  assert.equal(result.get("STOCK-YES")?.fast_delivery, 1);
});

test("Magento schema missing always_in_stock preserves older badges by retrying", async () => {
  class MagentoGraphQLError extends Error {}
  const requests = [];
  const query = loadTypeScript(root, "lib/magento/product-badges.ts", {
    "@/lib/magento/client": {
      MagentoGraphQLError,
      magentoGraphQL: async (document) => {
        requests.push(document);
        if (document.includes("always_in_stock")) {
          throw new MagentoGraphQLError('Cannot query field "always_in_stock" on type "ProductInterface".');
        }
        return { products: { items: [{ sku: "STOCK-LEGACY", fast_delivery: 1 }] } };
      },
    },
  });

  const result = await query.getProductBadgeValues("customer-token", ["STOCK-LEGACY"]);
  assert.equal(requests.length, 2);
  assert.match(requests[0], /always_in_stock/);
  assert.doesNotMatch(requests[1], /always_in_stock/);
  assert.equal(result.get("STOCK-LEGACY")?.fast_delivery, 1);
  assert.equal(result.get("STOCK-LEGACY")?.always_in_stock, undefined);
});

test("Always in Stock overlay uses a legible top-left panel on cards and PDP", () => {
  const css = source("app/product-badges.css");
  const card = css.match(/\.always-in-stock-overlay\s*\{([^}]*)\}/)?.[1];
  const gallery = css.match(/\.pdp-gallery-main \.always-in-stock-overlay\s*\{([^}]*)\}/)?.[1];
  assert.ok(card, "catalogue overlay styles should exist");
  assert.ok(gallery, "PDP overlay styles should exist");

  assert.match(card, /\btop:\s*10px;/);
  assert.match(card, /\bleft:\s*10px;/);
  assert.doesNotMatch(card, /\b(?:right|bottom):/);
  assert.match(card, /background:\s*rgb\(255 255 255 \/ 96%\)/);
  assert.match(card, /border-radius:\s*10px/);
  assert.match(card, /box-shadow:/);
  assert.match(card, /pointer-events:\s*none/);

  assert.match(gallery, /\btop:/);
  assert.match(gallery, /\bleft:/);
  assert.doesNotMatch(gallery, /\b(?:right|bottom):/);
  assert.match(css, /\.always-in-stock-overlay::before\s*\{[^}]*aspect-ratio:\s*651 \/ 246;[^}]*background: url\("\/always-in-stock\.png"\)/);
  assert.match(css, /@media \(max-width: 560px\)\s*\{\s*\.always-in-stock-overlay\s*\{[^}]*top:\s*8px;[^}]*left:\s*8px;/);
});
