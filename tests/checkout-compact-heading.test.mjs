import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("delivery and payment use a single compact accessible heading with existing back links", () => {
  for (const [step, title, back] of [
    ["delivery", "Delivery &amp; details", "/basket"],
    ["payment", "Review &amp; submit", "/checkout/delivery"],
  ]) {
    const page = source(`app/checkout/${step}/page.tsx`);
    const header = page.match(/<header className="checkout-heading checkout-heading-compact">([\s\S]*?)<\/header>/)?.[1];
    assert.ok(header, step + " compact header");
    assert.ok(header.includes(`<h1>${title}</h1>`));
    assert.ok(header.includes(`href="${back}"`));
    assert.doesNotMatch(header, /eyebrow|className="muted"|basket-heading/);
    assert.match(page, new RegExp(`<CheckoutSteps current="${step}"\\s*\\/>`));
    assert.equal((header.match(/<h1>/g) || []).length, 1);
  }
});

test("compact sizing and spacing are scoped to checkout, and the back controls remain usable", () => {
  const css = source("app/checkout-polish.css");
  assert.match(css, /\.checkout-heading\.checkout-heading-compact\s*\{[\s\S]*?flex-wrap: wrap;[\s\S]*?align-items: center;[\s\S]*?margin: 0;/);
  assert.match(css, /\.checkout-heading\.checkout-heading-compact h1\s*\{[\s\S]*?font-size: clamp\(1\.35rem, 2\.2vw, 1\.75rem\)/);
  assert.match(css, /\.delivery-page > nav > \.checkout-progress,\s*\.payment-page > nav > \.checkout-progress\s*\{\s*margin-bottom: 0;/);
  assert.match(css, /\.checkout-back,\s*\.delivery-back,\s*\.payment-back\s*\{\s*min-height: 42px;/);
});
