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
  assert.match(runtime, /getEmployeeCataloguePolicy\(token, mode.companyId, id\)/);
  assert.match(checkout, /await assertEmployeeCatalogueCartReady\(token, initialCart.id\)/);
  assert.match(checkout, /await assertEmployeeCatalogueCartReady\(token, cart.id\)/);
  assert.match(legacy, /policy\?\.skus \?\? null/);
  for (const action of ["app/account/orders/actions.ts", "app/account/repeat-orders/actions.ts"]) {
    assert.match(source(action), /if \(await getEmployeeCatalogueMode\(token\)\)/);
  }
});

test("Employee catalogue reads the selected Employee's Magento role directly, with no PostgreSQL reader", () => {
  const reader = source("lib/employee-catalogue-native.ts");
  assert.match(reader, /css_effective_catalogue_products/);
  assert.doesNotMatch(reader, /getActiveEmployees\(token\)/);
  assert.match(reader, /role_ids/);
  assert.doesNotMatch(reader, /employee\.purchase_control_role_id/);
  assert.doesNotMatch(reader, /from "postgres"|css_admin\.read_|SELECT css_admin/i);
  assert.doesNotMatch(source("lib/employee-catalogue.ts"), /employee-catalogue-db/);
});

test("Unrestricted Catalogue Role inherits only the authenticated Magento company/buyer ceiling",()=>{
  const inherited = {
    ...granted, catalogueScope: "COMPANY_INHERITED",
    skus: [], productIds: [],
  };
  assert.doesNotThrow(() => policy.assertEmployeeProductAllowed(inherited, "ANY-MAGENTO-COMPANY-SKU"));
  const actualCart=[{uid:"line-1",product:{sku:"COMPANY-ITEM"},
    css_employee:{employee_id:1},css_kit:null}];
  assert.doesNotThrow(()=>policy.assertEmployeeCartAllowed(
    actualCart,new Map([[1,inherited]]),new Set([1]),true));
  assert.throws(()=>policy.assertEmployeeCartAllowed(
    actualCart,new Map([[1,inherited]]),new Set([2]),true));
  // Without the explicit inherited contract, an empty qualified list denies all.
  const empty={...granted,catalogueScope:"EXPLICIT_SKUS",skus:[],productIds:[]};
  assert.throws(()=>policy.assertEmployeeProductAllowed(empty,"COMPANY-ITEM"));
  assert.throws(()=>policy.assertEmployeeCartAllowed(
    actualCart,new Map([[1,empty]]),new Set([1]),true));
  const reader=source("lib/employee-catalogue-native.ts");
  assert.match(reader,/if \(value.scope === "COMPANY_INHERITED"\)/);
  assert.match(reader,/value.products.length === 0/);
  assert.match(reader,/companyId, roleId/);
});

test("Inherited Employee browsing keeps Magento scope and hides buyer-only purchase allowances",async()=>{
  const calls=[];
  const catalogueReader=load(root,"lib/magento/catalogue-page.ts",{
    "@/lib/magento/client": {magentoGraphQL:async(query,variables)=>{
      calls.push({query,variables});
      return {
        customer:{firstname:"Buyer",lastname:"Manager"},
        css_company_context:{companies:[{company_id:20,name:"CUR012",selected:true}]},
        css_storefront_policy:{hide_price:true},
        products:{total_count:1,page_info:{current_page:1,total_pages:1},
          items:[{uid:"x",sku:"COMPANY/01",name:"Company product",
            css_purchase_allowance:{logical_product_id:90,has_active_restriction:true}}]},
      };
    }},
    "@/lib/magento/catalogue-prices": {getResilientCataloguePrices:async()=>new Map()},
  });
  const result=await catalogueReader.getCataloguePageContext("token","",1,24,null,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].variables.filter.sku,undefined);
  assert.equal(result.products.items[0].sku,"COMPANY/01");
  assert.equal(result.products.items[0].css_purchase_allowance,null);
  assert.equal(result.selectedCompany.company_id,20);
});

test("Employee-first single-Employee cart carries selection into checkout", () => {
  const runtime=source("lib/employee-catalogue.ts");
  const delivery=source("app/checkout/delivery/page.tsx");
  const products=source("app/product/[sku]/actions.ts");
  const grouped=source("app/product/[sku]/grouped-actions.ts");
  assert.match(runtime,/assignSelectedCatalogueEmployeeToBasket/);
  assert.match(runtime,/assignCartEmployee\(token, cart.id, selected.employeeId\)/);
  assert.match(products,/await assignSelectedCatalogueEmployeeToBasket\(token\)/);
  assert.match(grouped,/await assignSelectedCatalogueEmployeeToBasket\(token\)/);
  assert.match(delivery,/selectedCatalogueEmployee/);
  assert.match(delivery,/currentEmployeeId === selectedCatalogueEmployee\?\.employeeId/);
});

test("Full production native mode honours Magento uses_employee and keeps its global OFF switch",()=>{
  const runtime=source("lib/employee-catalogue.ts");
  assert.match(runtime,/LIVE_MAGENTO_ROLE/);
  assert.match(runtime,/if \(!config.uses_employee\) return null/);
  assert.doesNotMatch(runtime,/CSS_STORE_EMPLOYEE_CATALOGUE_COMPANY_IDS/);
  assert.match(runtime,/CSS_STORE_EMPLOYEE_CATALOGUE_ENABLED/);
});
