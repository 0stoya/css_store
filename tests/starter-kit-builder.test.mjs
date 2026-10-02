import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Css grouped configurable products use the dedicated starter-kit builder", () => {
  const page = source("app/product/[sku]/page.tsx");

  assert.match(page, /const starterKit = product\.__typename === "CssGroupedConfigurableProduct"/);
  assert.match(page, /<StarterKitBuilder items=\{starterKitItems\} canAdd=\{canAdd\}\/>/);
  assert.match(page, /<form action=\{addProductToCartAction\} className="starter-kit-form">/);
  assert.match(page, /Build this starter kit/);
  assert.match(page, /Who is this kit for\?/);
  assert.match(page, /starterKit \? <section className="card starter-kit-order-panel">/);
});

test("Starter-kit items submit one grouped selection with the existing field contract", () => {
  const builder = source("components/starter-kit-builder.tsx");
  const actions = source("app/product/[sku]/actions.ts");

  assert.match(builder, /name=\{\`child_\$\{item\.index\}_sku\`\}/);
  assert.match(builder, /name=\{\`child_\$\{item\.index\}_option\`\}/);
  assert.match(builder, /name=\{\`child_\$\{item\.index\}_quantity\`\}/);
  assert.match(builder, /Add starter kit to basket/);
  assert.doesNotMatch(builder, /grouped_child_sku/);

  assert.match(actions, /function groupedConfigurableSelections/);
  assert.match(actions, /const items = groupedConfigurableSelections\(product, formData\)/);
  assert.match(actions, /await addGroupedConfigurableProduct\(token, \{/);
  assert.match(actions, /items,/);
});

test("Starter-kit PDP reuses Magento child images and grouped default quantities", () => {
  const page = source("app/product/[sku]/page.tsx");
  const pdp = source("lib/magento/pdp-page.ts");
  const product = source("lib/magento/product.ts");

  assert.match(pdp, /small_image \{ url label \}/);
  assert.match(product, /small_image: \{ url: string; label: string \| null \} \| null/);
  assert.match(page, /image: child\.small_image \|\| null/);
  assert.match(page, /const configuredQuantity = Number\(item\.qty \|\| 0\)/);
  assert.match(page, /defaultQuantity: configuredQuantity > 0 \? configuredQuantity : 0/);
  assert.match(page, /childPrice && childPrice\.value > 0/);
});

test("Starter-kit presentation removes the old line-by-line add pattern", () => {
  const builder = source("components/starter-kit-builder.tsx");
  const styles = source("app/starter-kit.css");
  const layout = source("app/layout.tsx");

  assert.match(builder, /starter-kit-progress/);
  assert.match(builder, /starter-kit-item-state/);
  assert.match(builder, /Items with quantity 0 are left out/);
  assert.match(styles, /\.starter-kit-order-panel/);
  assert.match(styles, /\.starter-kit-item\.complete/);
  assert.match(styles, /\.starter-kit-primary-action/);
  assert.match(layout, /import "\.\/starter-kit\.css"/);
});
