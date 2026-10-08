import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("native grouped bulk additions retain their grouped parent SKU", () => {
  const actions = source("app/product/[sku]/actions.ts");
  assert.match(actions, /product\.__typename === "GroupedProduct"/);
  assert.match(actions, /items\.push\(\{ sku: child\.sku, quantity: rawQuantity, parentSku: product\.sku \}\)/);
});

test("native grouped single-line additions retain their grouped parent SKU", () => {
  const actions = source("app/product/[sku]/grouped-actions.ts");
  assert.match(actions, /addNativeProducts\(token, before\.id, \[\{[\s\S]*?sku: child\.sku,[\s\S]*?parentSku: product\.sku,[\s\S]*?\}\]\)/);
});

test("only the grouped flows opt in to Magento's parent_sku context", () => {
  const cart = source("lib/magento/cart.ts");
  const actions = source("app/product/[sku]/actions.ts");

  assert.match(cart, /\.{3}\(input\.parentSku \? \{ parent_sku: input\.parentSku \} : \{\}\)/);
  assert.match(actions, /const after = await addNativeProduct\(token, before\.id, \{[\s\S]*?sku: product\.sku,[\s\S]*?selectedOptions: selected,/);
});
