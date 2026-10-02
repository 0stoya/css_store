import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("catalogue cards keep product imagery compact on desktop and responsive sizes", () => {
  const styles = source("app/catalogue-ux.css");

  assert.match(styles, /grid-template-rows:\s*195px 1fr/);
  assert.match(styles, /height:\s*195px/);
  assert.match(styles, /padding:\s*24px/);
  assert.match(styles, /\.product-media img/);
  assert.match(styles, /width:\s*100% !important/);
  assert.match(styles, /height:\s*100% !important/);
  assert.match(styles, /object-fit:\s*contain/);
  assert.match(styles, /grid-template-rows:\s*185px 1fr/);
  assert.match(styles, /height:\s*185px/);
  assert.match(styles, /grid-template-rows:\s*235px auto/);
  assert.match(styles, /height:\s*235px/);
});

test("starter-kit incomplete option badge stays compact and single-line", () => {
  const styles = source("app/starter-kit.css");
  const builder = source("components/starter-kit-builder.tsx");

  assert.match(builder, /className="needs-options">Choose options/);
  assert.match(styles, /\.starter-kit-item-state \.needs-options/);
  assert.match(styles, /white-space:\s*nowrap/);
  assert.match(styles, /grid-template-columns:\s*76px minmax\(220px, 1\.25fr\) minmax\(260px, 1fr\) 150px 112px/);
});
