import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Css grouped configurable products use the dedicated starter-kit builder", () => {
  const page = source("app/product/[sku]/page.tsx");

  assert.match(page, /const starterKit = product\.__typename === "CssGroupedConfigurableProduct"/);
  assert.match(page, /<StarterKitBuilder key=\{starterKitBuilderKey\} items=\{starterKitItems\} canAdd=\{canAdd\}\/>/);
  assert.match(page, /<form action=\{addProductToCartAction\} className="starter-kit-form">/);
  assert.match(page, /Build this starter kit/);
  assert.match(page, /Who is this kit for\?/);
  assert.match(page, /starterKit \? <section className="card starter-kit-order-panel">/);
});

test("Starter-kit parent pricing is hidden without removing child prices", () => {
  const page = source("app/product/[sku]/page.tsx");

  // A positive Magento parent min-price is not the price of a configurable kit selection.
  assert.match(page, /!starterKit && !storefrontPolicy\.hidePrice && price \? <div className="pdp-price-card">/);
  assert.doesNotMatch(page, /\(!starterKit \|\| price\.final_price\.value > 0\)/);
  assert.match(page, /priceLabel: !storefrontPolicy\.hidePrice && childPrice && childPrice\.value > 0/);
});

test("Starter-kit items submit one grouped selection with the existing field contract", () => {
  const builder = source("components/starter-kit-builder.tsx");
  const actions = source("app/product/[sku]/actions.ts");

  assert.match(builder, /name=\{\`child_\$\{item\.index\}_sku\`\}/);
  assert.match(builder, /name=\{\`child_\$\{item\.index\}_option\`\}/);
  assert.match(builder, /name=\{\`child_\$\{item\.index\}_quantity\`\}/);
  assert.match(builder, /Add \${progress\.selectedCount} item/);
  assert.match(builder, /Choose items to add/);
  assert.doesNotMatch(builder, /grouped_child_sku/);

  assert.match(actions, /function groupedConfigurableSelections/);
  assert.match(actions, /const items = groupedConfigurableSelections\(product, formData\)/);
  assert.match(actions, /await addGroupedConfigurableProduct\(token, \{/);
  assert.match(actions, /items,/);
  assert.match(actions, /if \(rawQuantity === 0\) continue;/);
});

test("Starter-kit PDP starts every available grouped item unselected", () => {
  const page = source("app/product/[sku]/page.tsx");
  const builder = source("components/starter-kit-builder.tsx");
  const pdp = source("lib/magento/pdp-page.ts");
  const product = source("lib/magento/product.ts");

  assert.match(pdp, /small_image \{ url label \}/);
  assert.match(product, /small_image: \{ url: string; label: string \| null \} \| null/);
  assert.match(page, /image: child\.small_image \|\| null/);
  assert.doesNotMatch(page, /defaultQuantity/);
  assert.match(builder, /function emptyQuantities/);
  assert.match(builder, /items\.map\(\(item\) => \[item\.index, 0\]\)/);
  assert.match(builder, /useState<Record<number, number>>\(\(\) => emptyQuantities\(items\)\)/);
  assert.doesNotMatch(builder, /useEffect|setQuantities\(emptyQuantities\(items\)\)/);
  assert.match(page, /const starterKitBuilderKey = /);
  assert.match(page, /<StarterKitBuilder key=\{starterKitBuilderKey\}/);
  assert.match(builder, /disabled=\{!item\.available \|\| !selected\}/);
  assert.match(page, /childPrice && childPrice\.value > 0/);
});

test("Starter-kit thumbnail opens an accessible modal without submitting the basket form", () => {
  const builder = source("components/starter-kit-builder.tsx");
  const styles = source("app/starter-kit.css");

  assert.match(builder, /type="button"\s+className="starter-kit-thumbnail-button"/);
  assert.match(builder, /aria-label=\{`View larger image of \$\{item\.name\}`\}/);
  assert.match(builder, /onClick=\{\(\) => openImagePreview\(item\)\}/);
  assert.match(builder, /imageDialogRef\.current\?\.showModal\(\)/);
  assert.match(builder, /<dialog[\s\S]*onClose=\{\(\) => setPreviewItem\(null\)\}/);
  assert.match(builder, /event\.target === event\.currentTarget\) event\.currentTarget\.close\(\)/);
  assert.match(builder, /aria-label="Close image preview"/);
  assert.match(builder, /imageDialogRef\.current\?\.close\(\)/);
  assert.match(builder, /src=\{previewItem\.image\.url\}/);
  assert.match(builder, /type="button"\s+className="starter-kit-image-dialog-close"/);
  assert.match(styles, /\.starter-kit-image-dialog::backdrop/);
  assert.match(styles, /\.starter-kit-thumbnail-button:focus-visible/);
  assert.match(styles, /max-height: min\(72dvh, 780px\)/);
});

test("Starter-kit option selects only allow real in-stock variant combinations", () => {
  const page = source("app/product/[sku]/page.tsx");
  const builder = source("components/starter-kit-builder.tsx");
  const actions = source("app/product/[sku]/actions.ts");

  assert.match(page, /variants: child\.variants \|\| \[\]/);
  assert.match(builder, /variants: ConfigurableVariant\[\]/);
  assert.match(builder, /function variantMatches/);
  assert.match(builder, /function selectedVariant/);
  assert.match(builder, /function optionValueAvailable/);
  assert.match(builder, /variantInStock\(variant\) && variantMatches\(variant, candidate\)/);
  assert.match(builder, /disabled=\{!available && !active\}/);
  assert.match(builder, /Combination unavailable/);
  assert.match(builder, /const incomplete = selectedItems\.filter\(\(item\) => !selectedVariant\(item, selections\)\)/);
  assert.match(actions, /child\.name.*error\.message/);
});

test("Starter-kit presentation removes the old line-by-line add pattern", () => {
  const builder = source("components/starter-kit-builder.tsx");
  const styles = source("app/starter-kit.css");
  const layout = source("app/layout.tsx");

  assert.match(builder, /starter-kit-progress/);
  assert.match(builder, /starter-kit-item-state/);
  assert.match(builder, /kit items ready/);
  assert.match(builder, /needs-options/);
  assert.match(builder, /Items with quantity 0 are left out/);
  assert.match(styles, /\.starter-kit-order-panel/);
  assert.match(styles, /\.starter-kit-item\.complete/);
  assert.match(styles, /\.starter-kit-primary-action/);
  assert.match(layout, /import "\.\/starter-kit\.css"/);
});
