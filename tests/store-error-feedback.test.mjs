import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("Unhandled page errors show a safe, actionable Store fallback", () => {
  const page = source("app/error.tsx");
  assert.match(page, /^"use client";/);
  assert.match(page, /error: Error & \{ digest\?: string \}/);
  assert.match(page, /reset: \(\) => void/);
  assert.match(page, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(page, /We couldn’t load this page/);
  assert.match(page, /role="alert"/);
  assert.match(page, /href="\/catalogue"/);
  assert.match(page, /Browse products/);
  assert.doesNotMatch(page, /\{error\.message\}/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});

test("Support reference is an optional restricted digest, never the exception text", () => {
  const page = source("app/error.tsx");
  assert.match(page, /\/\^\[a-zA-Z0-9-\]\{1,64\}\$\//);
  assert.match(page, /Support reference:/);
  assert.match(page, /\{reference\}/);
  assert.doesNotMatch(page, /console\.(?:log|error)\(error\)/);
});

test("Root-layout errors have a separate, self-contained fallback", () => {
  const page = source("app/global-error.tsx");
  assert.match(page, /^"use client";/);
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<body style=/);
  assert.match(page, /role="alert"/);
  assert.match(page, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(page, /Support reference:/);
  assert.doesNotMatch(page, /\{error\.message\}/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});

test("Missing or inaccessible product routes never disclose catalogue identity", () => {
  const page = source("app/not-found.tsx");
  assert.match(page, /We couldn’t find that page/);
  assert.match(page, /product may not be available in your catalogue/);
  assert.match(page, /href="\/catalogue"/);
  assert.doesNotMatch(page, /product\.sku/);
});

test("Fallback styling is isolated from product, basket and checkout styles", () => {
  const layout = source("app/layout.tsx");
  const css = source("app/store-error.css");
  assert.match(layout, /import "\.\/store-error\.css"/);
  assert.match(css, /\.store-error-page/);
  assert.match(css, /\.store-error-card/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.doesNotMatch(css, /\.pdp-price-card|\.basket-|\.checkout-/);
});

test("Existing security and checkout handling remain outside the fallback", () => {
  const client = source("lib/magento/client.ts");
  const product = source("app/product/[sku]/page.tsx");
  const action = source("app/product/[sku]/actions.ts");
  assert.match(client, /isCustomerSessionFailure/);
  assert.match(client, /redirect\("\/api\/auth\/session-expired"\)/);
  assert.match(product, /!employeeOrderingBlocked && !storefrontPolicy\.hideAddToCart/);
  assert.match(action, /await addGroupedConfigurableProduct\(token, \{/);
  assert.match(action, /getEmployeeOrdering\(token\)/);
});
