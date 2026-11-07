import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const example = {
  company_id: 10, company_user_id: 34, employee_id: 10,
  role_ids: [83], scope: "EXPLICIT_SKUS",
  products: [{ id: 1462, sku: "AMS/0353/NV/XTW044" }, { id: 1601, sku: "AMS/3200/NV/1X" }],
};
function mock(graph) {
  return load(root, "lib/employee-catalogue-native.ts", {
    react: { cache: fn => fn },
    "next/navigation": { unstable_rethrow: () => {} },
    "@/lib/magento/client": { magentoGraphQL: graph || (async (query, variables, token) => {
      assert.match(query, /css_effective_catalogue_products\(employee_id: \$employeeId\)/);
      assert.doesNotMatch(query, /css_company_role_catalog_policy/);
      assert.equal(variables.employeeId, 10);
      assert.equal(token, "CUSTOMER_TOKEN");
      return { css_effective_catalogue_products: example };
    }) },
  });
}
test("Single read returns Magento-authorised Employee role and effective SKUs", async () => {
  const result = await mock().getEmployeeCataloguePolicy("CUSTOMER_TOKEN", 10, 10);
  assert.deepEqual({companyId:result.companyId,employeeId:result.employeeId,roleId:result.roleId}, 
    {companyId:10,employeeId:10,roleId:83});
  assert.equal(result.catalogueScope, "EXPLICIT_SKUS");
  assert.deepEqual(Array.from(result.productIds), [1462,1601]);
  assert.deepEqual(Array.from(result.skus), ["AMS/0353/NV/XTW044","AMS/3200/NV/1X"]);
  assert.doesNotMatch(source("lib/employee-catalogue-native.ts"),
    /css_company_role_catalog_policy|getActiveEmployees|PAGE_READ_CONCURRENCY|from "postgres"/);
});
test("Inherited and explicit-empty are different: empty never expands permissions", () => {
  const mod = mock();
  const inherited = mod.qualifyEffectiveEmployeeCatalogue({...example,scope:"COMPANY_INHERITED",products:[]},10,10);
  const empty = mod.qualifyEffectiveEmployeeCatalogue({...example,products:[]},10,10);
  assert.deepEqual([inherited.catalogueScope,empty.catalogueScope],["COMPANY_INHERITED","EXPLICIT_SKUS"]);
  assert.deepEqual(Array.from(empty.skus),[]);
  assert.throws(() => mod.qualifyEffectiveEmployeeCatalogue({...example,scope:"COMPANY_INHERITED"},10,10));
});
test("Wrong company, missing identity, roles, duplicate SKUs or IDs fail closed", () => {
  const mod = mock();
  for (const value of [
    null,{}, {...example,company_id:11}, {...example,company_user_id:0},
    {...example,employee_id:11},{...example,role_ids:[]},{...example,role_ids:[83,84]},
    {...example,scope:"ALL"}, {...example,products:null},
    {...example,products:[{id:1,sku:"A"},{id:1,sku:"B"}]},
    {...example,products:[{id:1,sku:"A"},{id:2,sku:"a"}]},
    {...example,products:[{id:0,sku:"x"}]},
  ]) assert.throws(() => mod.qualifyEffectiveEmployeeCatalogue(value,10,10));
});
test("Denied native scope fails closed without exposing customer token or Magento details", async () => {
  const mod = mock(async () => {throw Object.assign(new Error("private source response"),
    {category:"graphql-authorization",status:200});});
  await assert.rejects(mod.getEmployeeCataloguePolicy("CUSTOMER_TOKEN",10,10),
    error => error.message.includes("EMPLOYEE_SCOPE_ACCESS_DENIED")
      && !error.message.includes("CUSTOMER_TOKEN")
      && !error.message.includes("private"));
}); 
