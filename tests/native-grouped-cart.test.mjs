import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("native grouped PDP uses parent-validated grouped cart mutation", () => {
  const actions = source("app/product/[sku]/actions.ts");
  const childActions = source("app/product/[sku]/grouped-actions.ts");
  const cart = source("lib/magento/cart.ts");

  assert.match(actions, /product\.__typename === "GroupedProduct"/);
  assert.match(actions, /addNativeGroupedProducts\(token, before\.id, product\.sku, items\)/);
  assert.match(childActions, /addNativeGroupedProducts\(token, before\.id, product\.sku, \[\{ sku: child\.sku, quantity \}\]\)/);

  assert.doesNotMatch(actions, /addNativeProducts\(token, before\.id, items\)/);
  assert.doesNotMatch(childActions, /addNativeProducts\(token, before\.id, /);

  assert.match(cart, /mutation StoreAddNativeGrouped\(\$input: CssAddNativeGroupedProductsToCartInput!\)/);
  assert.match(cart, /cssAddNativeGroupedProductsToCart\(input: \$input\)/);
  assert.match(cart, /parent_sku: parentSku/);
  assert.match(cart, /cart_id: cartId/);
});

test("grouped-configurable and ordinary product add paths stay separate", () => {
  const actions = source("app/product/[sku]/actions.ts");
  const childActions = source("app/product/[sku]/grouped-actions.ts");

  assert.match(actions, /addGroupedConfigurableProduct\(token, \{/);
  assert.match(childActions, /addGroupedConfigurableProduct\(token, \{/);
  assert.match(actions, /addNativeProduct\(token, before\.id, \{/);
  assert.match(actions, /if \(rawQuantity === 0\) continue;/);
});

test("existing employee assignment remains on grouped basket rows", () => {
  const actions = source("app/product/[sku]/actions.ts");
  const childActions = source("app/product/[sku]/grouped-actions.ts");

  assert.match(actions, /await assignCartItemEmployee\(token, after\.id, item\.uid, employeeId\)/);
  assert.match(childActions, /await assignCartItemEmployee\(token, after\.id, item\.uid, employeeId\)/);
});
