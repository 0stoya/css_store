import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const page = source("app/product/[sku]/page.tsx");
const styles = source("app/pdp-simplified.css");
const formStart = page.indexOf("const simpleBuyForm = ");
const pageStart = page.indexOf("  return <>", formStart);
const simpleForm = page.slice(formStart, pageStart);

test("Only SimpleProduct uses the compact hero purchase form", () => {
  assert.match(page, /const simpleProduct = product\.__typename === "SimpleProduct";/);
  assert.match(simpleForm, /simpleProduct \? <form action=\{addProductToCartAction\} className="pdp-simple-buy-form">/);
  assert.equal((page.match(/<QuantityStepper\b/g) || []).length, 1);
  assert.match(page, /!starterKit && !configurable && !simpleProduct \? <section className="card order-panel pdp-order-panel">/);
  assert.doesNotMatch(page, /\{product\.__typename === "SimpleProduct" \? <section className="pdp-option-section pdp-single-quantity-section">/);
});

test("Simple checkout retains the original quantity limits and server action", () => {
  assert.ok(formStart >= 0 && pageStart > formStart);
  assert.match(simpleForm, /name="product_sku" value=\{product\.sku\}/);
  assert.match(simpleForm, /name="quantity"/);
  assert.match(simpleForm, /defaultValue=\{Math\.max\(1, product\.css_purchase_constraints\?\.minimum_quantity \|\| 1\)\}/);
  assert.match(simpleForm, /min=\{product\.css_purchase_constraints\?\.minimum_quantity \|\| 1\}/);
  assert.match(simpleForm, /max=\{product\.css_purchase_constraints\?\.maximum_quantity \?\? undefined\}/);
  assert.match(simpleForm, /step=\{product\.css_purchase_constraints\?\.increments_enforced \? product\.css_purchase_constraints\.quantity_increment : "any"\}/);
  assert.match(simpleForm, /<button className="button order-primary-action" type="submit" disabled=\{!canAdd\}>/);
  assert.match(simpleForm, /<span>\{canAdd \? addLabel : "Ordering unavailable"\}<\/span>/);
});

test("Employee context remains inside the simple add-to-cart form", () => {
  assert.match(simpleForm, /employeeOrdering\.usesEmployee && employeeOrdering\.multiEmployeeBasket/);
  assert.match(simpleForm, /<EmployeePicker employees=\{employeeOrdering\.employees\} label="Who is this for\?"\/>/);
  assert.match(simpleForm, /employeeOrdering\.usesEmployee && !employeeOrdering\.multiEmployeeBasket/);
  assert.match(simpleForm, /Employee selection happens at the start of checkout/);
  assert.match(simpleForm, /This product can’t currently be added to the basket/);
});

test("Simple action sits next to visible price and remains available when price hidden", () => {
  assert.match(page, /!starterKit && !storefrontPolicy\.hidePrice && price \? <div className="pdp-price-card">/);
  assert.match(page, /\{simpleBuyForm\}\s*<\/div> : simpleProduct \? <div className="pdp-simple-buy-standalone">\{simpleBuyForm\}<\/div> : null\}/);
});

test("Grouped, configurable and starter kit purchase pathways remain separate", () => {
  assert.match(page, /const starterKit = product\.__typename === "CssGroupedConfigurableProduct";/);
  assert.match(page, /const nativeGrouped = product\.__typename === "GroupedProduct";/);
  assert.match(page, /\{configurable \? <form action=\{addProductToCartAction\} className="configurable-order-card">/);
  assert.match(page, /\{starterKit \? <section className="card starter-kit-order-panel">/);
  assert.match(page, /<StarterKitBuilder key=\{starterKitBuilderKey\} items=\{starterKitItems\} canAdd=\{canAdd\}\/>/);
  assert.match(page, /action=\{grouped \? addGroupedChildToCartAction : addProductToCartAction\}/);
});

test("Inline controls use dedicated responsive rules, not global product card changes", () => {
  assert.match(styles, /\.pdp-price-card > \.pdp-simple-buy-form/);
  assert.match(styles, /\.pdp-simple-buy-controls/);
  assert.match(styles, /\.pdp-simple-buy-controls \.quantity-stepper/);
  assert.match(styles, /\.pdp-simple-buy-standalone/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /@media \(max-width: 420px\)/);
});
