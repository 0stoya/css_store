import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("catalogue cards use the square media box itself as the height-filled image frame", () => {
  const styles = source("app/catalogue-ux.css");
  const card = source("components/product-card.tsx");

  assert.doesNotMatch(card, /product-media-frame/);
  assert.match(styles, /\.product-media \{[\s\S]*?height:\s*auto;[\s\S]*?aspect-ratio:\s*1/);
  assert.match(styles, /grid-template-rows:\s*auto 1fr/);
  assert.match(styles, /\.product-media img/);
  assert.match(styles, /width:\s*auto !important/);
  assert.match(styles, /height:\s*auto !important/);
  assert.match(styles, /max-height:\s*100%/);
  assert.match(styles, /object-fit:\s*contain/);
});

test("PDP gallery uses the same natural-width max-height containment", () => {
  const styles = source("app/pdp.css");

  assert.match(styles, /\.pdp-gallery-main > img/);
  assert.match(styles, /width:\s*auto/);
  assert.match(styles, /height:\s*auto/);
  assert.match(styles, /max-width:\s*100%/);
  assert.match(styles, /max-height:\s*100%/);
  assert.match(styles, /object-fit:\s*contain/);
});
test("PDP desktop layout gives product information more room", () => {
  const styles = source("app/pdp.css");

  assert.match(styles, /\.pdp-hero \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(380px, 2fr\)/);
  assert.match(styles, /\.pdp-info h1 \{[\s\S]*?max-width:\s*none/);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*?\.pdp-hero,[\s\S]*?grid-template-columns:\s*1fr/);
});

test("starter-kit incomplete option badge stays compact and single-line", () => {
  const styles = source("app/starter-kit.css");
  const builder = source("components/starter-kit-builder.tsx");

  assert.match(builder, /className="needs-options">Choose options/);
  assert.match(styles, /\.starter-kit-item-state \.needs-options/);
  assert.match(styles, /white-space:\s*nowrap/);
  assert.match(styles, /grid-template-columns:\s*76px minmax\(220px, 1\.25fr\) minmax\(260px, 1fr\) 150px 112px/);
});
