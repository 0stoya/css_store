import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("both checkout route loading states use the shared compact accessible status", () => {
  for (const step of ["delivery", "payment"]) {
    const route = source(`app/checkout/${step}/loading.tsx`);
    assert.ok(route.includes(`<CheckoutLoading label="Loading ${step} options…" />`));
    assert.doesNotMatch(route, /<h1|eyebrow|Magento/);
  }
  const component = source("components/checkout-loading.tsx");
  assert.match(component, /role="status"/);
  assert.match(component, /LoaderCircle[\s\S]*?aria-hidden="true"/);
  assert.doesNotMatch(component, /<h1|<h2/);
});

test("automatic defaults retain the guarded POST and manual fallback while showing a compact status", () => {
  const component = source("components/checkout-delivery-defaults.tsx");
  assert.match(component, /form.current.requestSubmit\(\)/);
  assert.match(component, /action=\{applyCheckoutDefaultsAction\}/);
  assert.match(component, /Apply delivery defaults/);
  assert.match(component, /disabled=\{pending\}/);
  for (const field of ["cart_id", "company_id", "customer_id"]) assert.ok(component.includes(`name="${field}"`));
  assert.match(component, /role="status"/);
  assert.doesNotMatch(component, /<h2>|Applying your available delivery defaults/);
});

test("spinner respects reduced motion and loading styles are checkout-scoped", () => {
  const css = source("app/checkout-polish.css");
  assert.match(css, /\.checkout-loading-status\s*\{[\s\S]*?min-height: 52px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.checkout-loading-spinner\s*\{\s*animation: none;/);
});
