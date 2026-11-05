import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const policy = load(root, "lib/employee-catalogue-policy.ts");

const granted = {
  companyId: 20, employeeId: 1, skus: ["KIT/AA", "JACKET/01"],
  productIds: [100, 101], sourceSha256: "a".repeat(64),
  expiresAt: "2030-01-01T00:00:00Z",
};

test("Employees OFF always bypasses the new catalogue feature", () => {
  const canCheckout = { authenticated: true, company_context: true, company_active: true, can_checkout: true };
  assert.equal(policy.employeeCatalogueApplies(true,
    { uses_employee: false, open_employee_purchasing: false },
    canCheckout, 20, 20), false);
  assert.equal(policy.employeeCatalogueApplies(true,
    { uses_employee: false, open_employee_purchasing: true },
    canCheckout, 20, 20), false);
  // Existing manager-scoped Employee ordering may use the new catalogue
  // when (and only when) the dedicated V2 source flag is enabled.
  assert.equal(policy.employeeCatalogueApplies(true,
    { uses_employee: true }, canCheckout, 20, 20), true);
  assert.equal(policy.employeeCatalogueApplies(false,
    { uses_employee: true, open_employee_purchasing: true },
    canCheckout, 20, 20), false);
});

test("Manager-scoped catalogue requires the buyer's actual authenticated company and checkout rights", () => {
  const active = { authenticated: true, company_context: true, company_active: true, can_checkout: true };
  assert.equal(policy.employeeCatalogueApplies(true,
    { uses_employee: true, open_employee_purchasing: true }, active, 20, 20), true);
  for (const denied of [
    { ...active, can_checkout: false },
    { ...active, company_active: false },
    { ...active, authenticated: false },
  ]) {
    assert.throws(() => policy.employeeCatalogueApplies(true,
      { uses_employee: true, open_employee_purchasing: true }, denied, 20, 20));
  }
  assert.throws(() => policy.employeeCatalogueApplies(true,
    { uses_employee: true, open_employee_purchasing: true }, active, 20, 21));
});

test("Per-Employee cart permission accepts qualified logical parent and rejects wrong company or product", () => {
  const lines = [{
    uid: "one", product: { sku: "VARIANT-CHILD", allowance_product_id: 234 },
    css_kit: { employee_id: 1, parent_kit_product_id: 100 },
    css_employee: { employee_id: 1 },
  }];
  const grants = new Map([[1, granted]]);
  assert.doesNotThrow(() => policy.assertEmployeeCartAllowed(lines, grants, new Set([1]), true));
  assert.throws(() => policy.assertEmployeeCartAllowed(lines, new Map(), new Set([1]), true));
  assert.throws(() => policy.assertEmployeeCartAllowed(lines, grants, new Set([2]), true));
  assert.throws(() => policy.assertEmployeeCartAllowed(
    [{ ...lines[0], css_kit: null, product: { sku: "NO", allowance_product_id: 456 } }],
    grants, new Set([1]), true));
  assert.throws(() => policy.assertEmployeeProductAllowed(granted, "NOT_GRANTED"));
});

test("Legacy Magento browse operation stays exactly unfiltered while Employee query filters before paging", async () => {
  const calls = [];
  const catalogueReader = load(root, "lib/magento/catalogue-page.ts", {
    "@/lib/magento/client": { magentoGraphQL: async (query, variables) => {
      calls.push({ query, variables });
      return {
        customer: { firstname: "User", lastname: "B" },
        css_company_context: { companies: [] },
        css_storefront_policy: { hide_price: true },
        products: { total_count: 1, page_info: { current_page: 1, total_pages: 1 },
          items: [{ uid: "x", sku: "KIT/AA", name: "Kit" }] },
      };
    } },
    "@/lib/magento/catalogue-prices": { getResilientCataloguePrices: async () => new Map() },
  });
  await catalogueReader.getCataloguePageContext("token", "", 1);
  await catalogueReader.getCataloguePageContext("token", "", 1, 24, ["KIT/AA"]);
  await catalogueReader.getCataloguePageContext("token", "Kit", 1, 24, ["KIT/AA"]);
  assert.equal(calls[0].variables.filter.sku, undefined);
  assert.deepEqual(Array.from(calls[1].variables.filter.sku.in), ["KIT/AA"]);
  assert.match(calls[2].query, /products\(\s*filter: \$filter\s*search: \$search/);
});

test("Zero permitted SKUs must not send empty-in filter to Magento", async () => {
  const calls = [];
  const catalogueReader = load(root, "lib/magento/catalogue-page.ts", {
    "@/lib/magento/client": { magentoGraphQL: async (query, variables) => {
      calls.push({ query, variables });
      return { customer: { firstname: "User", lastname: "B" },
        css_company_context: { companies: [] },
        css_storefront_policy: { hide_price: true } };
    } },
    "@/lib/magento/catalogue-prices": { getResilientCataloguePrices: async () => new Map() },
  });
  const result = await catalogueReader.getCataloguePageContext("token", "", 1, 24, []);
  assert.equal(result.products.total_count, 0);
  assert.equal(result.products.items.length, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /StoreEmployeeCatalogueEmpty/);
});

test("Final native and credit checkout both revalidate qualified membership before submit", () => {
  const runtime = source("lib/employee-catalogue.ts");
  const checkout = source("app/checkout/payment/actions.ts");
  const legacy = source("app/catalogue/page.tsx");
  assert.match(runtime, /if \(!employeeCatalogueFeatureEnabled\(\)\) return null/);
  assert.match(runtime, /getEmployeeCataloguePolicy\(mode.companyId, id\)/);
  assert.match(checkout, /await assertEmployeeCatalogueCartReady\(token, initialCart.id\)/);
  assert.match(checkout, /await assertEmployeeCatalogueCartReady\(token, cart.id\)/);
  assert.match(legacy, /policy\?\.skus \?\? null/);
  for (const action of ["app/account/orders/actions.ts", "app/account/repeat-orders/actions.ts"]) {
    assert.match(source(action), /if \(await getEmployeeCatalogueMode\(token\)\)/);
  }
});

test("Employee catalogue reader uses CSS Admin's own PostgreSQL projection, never an unrelated database", () => {
  const reader = source("lib/employee-catalogue-db.ts");
  assert.ok(reader.includes("SELECT css_admin.read_employee_catalogue_v1("));
  assert.equal(reader.includes("SELECT storefront.read_employee_catalogue_v1("), false);
});
