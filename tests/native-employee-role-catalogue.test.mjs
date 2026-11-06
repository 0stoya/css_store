import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function page(n, items, overrides = {}) {
  return {
    company_id:20, role_id:7,
    selected_category_ids:[5], expanded_category_ids:[5],
    has_saved_categories:true, show_product_grid:true,
    products_count:1, preselect_all_products:false,
    allowed_product_ids:[111],
    products: { total_count:2, page:n, page_size:1, preselect_all:false, items },
    ...overrides,
  };
}
const a = { id:111,sku:"JACKET/01",allowed:true };
const b = { id:222,sku:"BELT/02",allowed:false };
function mockSource({ employees, graph }) {
  return load(root,"lib/employee-catalogue-native.ts",{
    "node:crypto":{ createHash },
    react:{ cache: f => f },
    "next/navigation":{ unstable_rethrow:()=>{} },
    "@/lib/magento/employee":{ getActiveEmployees:async()=>employees??[
      {company_id:20,employee_id:33,purchase_control_role_id:7,active:true},
    ] },
    "@/lib/magento/client":{ magentoGraphQL:graph??(async(query,variables)=>{
      assert.match(query,/css_company_role_catalog_policy/);
      return { css_company_role_catalog_policy:variables.page===1?page(1,[a]):page(2,[b]) };
    }) },
  });
}
test("Native role is resolved from the Employee's Magento company and purchase role",async()=>{
  const mod=mockSource({});
  const result=await mod.getEmployeeCataloguePolicy("CUSTOMER_TOKEN",20,33);
  assert.equal(result.companyId,20);
  assert.equal(result.employeeId,33);
  assert.equal(result.roleId,7);
  assert.equal(result.catalogueScope,"EXPLICIT_SKUS");
  assert.deepEqual(Array.from(result.skus),["JACKET/01"]);
  assert.deepEqual(Array.from(result.productIds),[111]);
  assert.doesNotMatch(src("lib/employee-catalogue-native.ts"),/from "postgres"|css_admin\.read_|expires_at/i);
});
test("A role without saved restrictions inherits only Magento buyer company visibility",async()=>{
  const role=page(1,[],{
    has_saved_categories:false,show_product_grid:false,
    selected_category_ids:[],expanded_category_ids:[],
    allowed_product_ids:[],products_count:0,preselect_all_products:false,
    products:{total_count:0,page:1,page_size:50,preselect_all:false,items:[]},
  });
  const mod=mockSource({graph:async()=>({css_company_role_catalog_policy:role})});
  const result=await mod.getEmployeeCataloguePolicy("TOKEN",20,33);
  assert.equal(result.catalogueScope,"COMPANY_INHERITED");
  assert.deepEqual(Array.from(result.skus),[]);
});
test("Incomplete, drifted and contradictory role reads never fall back to all products",async()=>{
  const mod=mockSource({});
  await assert.rejects(mod.readNativeRole(20,7,async n=>n===1?page(1,[a]):page(2,[b],{allowed_product_ids:[222]})));
  await assert.rejects(mod.readNativeRole(20,7,async n=>n===1?page(1,[a]):page(2,[])));
  const inherited=page(1,[],{
    has_saved_categories:false,show_product_grid:false,
    selected_category_ids:[],expanded_category_ids:[],
    allowed_product_ids:[111],products_count:1,
    products:{total_count:0,page:1,page_size:50,preselect_all:false,items:[]},
  });
  await assert.rejects(mod.readNativeRole(20,7,async()=>inherited));
});
test("Wrong company, missing role and denied GraphQL access never grant an Employee catalogue",async()=>{
  const company=mockSource({employees:[{company_id:21,employee_id:33,purchase_control_role_id:7}]});
  await assert.rejects(company.getEmployeeCataloguePolicy("TOKEN",20,33),/cannot be verified/);
  const missing=mockSource({employees:[{company_id:20,employee_id:33,purchase_control_role_id:null}]});
  await assert.rejects(missing.getEmployeeCataloguePolicy("TOKEN",20,33),/no Magento Purchase Role assigned/);
  const denied=mockSource({graph:async()=>{throw new Error("Forbidden by Magento role ACL")}});
  await assert.rejects(denied.getEmployeeCataloguePolicy("TOKEN",20,33),/cannot be verified/);
});
test("No company-PG catalogue connection, expiry timer or pilot ID switch remains in native Store journey",()=>{
 const runtime=src("lib/employee-catalogue.ts");
 const config=src(".env.example");
 assert.match(runtime,/LIVE_MAGENTO_ROLE/);
 assert.match(runtime,/getEmployeeCataloguePolicy\(token, mode.companyId, id\)/);
 assert.doesNotMatch(runtime,/employee-catalogue-db|CATALOGUE_COMPANY_IDS/);
 assert.doesNotMatch(config,/CSS_STORE_EMPLOYEE_CATALOGUE_DATABASE_URL|CSS_STORE_EMPLOYEE_CATALOGUE_COMPANY_IDS/);
});

test("Native role diagnostics distinguish an unassigned role, permission denial and source mismatch",()=>{
  const mod=mockSource({});
  assert.equal(mod.classifyNativeRoleFailure(
    {diagnosticCode:"EMPLOYEE_ROLE_UNASSIGNED"},"EMPLOYEE_ASSIGNMENT"
  ),"EMPLOYEE_ROLE_UNASSIGNED");
  assert.equal(mod.classifyNativeRoleFailure(
    {category:"graphql-authorization",status:200},"ROLE_POLICY"
  ),"ROLE_POLICY_ACCESS_DENIED");
  assert.equal(mod.classifyNativeRoleFailure(
    new Error("Magento Employee Role catalogue could not be qualified."),"ROLE_POLICY"
  ),"ROLE_POLICY_UNQUALIFIED");
  assert.equal(mod.classifyNativeRoleFailure(
    new Error("Unknown source failure"),"EMPLOYEE_DIRECTORY"
  ),"EMPLOYEE_DIRECTORY_UNAVAILABLE");
  assert.equal(mod.classifyNativeRoleFailure(
    {status:503,category:"graphql-no-such-entity"},"ROLE_POLICY"
  ),"ROLE_POLICY_UNAVAILABLE");
});

test("Native role failures do not disclose tokens or raw Magento error messages",async()=>{
  const secret="sensitive-token-123";
  const mod=mockSource({graph:async()=>{throw Object.assign(new Error("sensitive email@example.com"),{
    category:"graphql-authorization",status:200,
  });}});
  await assert.rejects(
    mod.getEmployeeCataloguePolicy(secret,20,33),
    error=>error.message.includes("ROLE_POLICY_ACCESS_DENIED")
      && !error.message.includes(secret)
      && !error.message.includes("example.com")
  );
});
