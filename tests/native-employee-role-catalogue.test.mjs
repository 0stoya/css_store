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
      assert.doesNotMatch(query,/has_saved_categories|selected_category_ids|expanded_category_ids|show_product_grid/);
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
test("Role with no saved products inherits the Magento buyer/company ceiling even with a nonempty company grid",async()=>{
  const allowedB={...b,allowed:true};
  const role=page(1,[a,allowedB],{
    has_saved_categories:false,show_product_grid:true,
    selected_category_ids:[],expanded_category_ids:[],
    allowed_product_ids:[],products_count:0,preselect_all_products:true,
    products:{total_count:80000,page:1,page_size:2,preselect_all:true,items:[a,allowedB]},
  });
  let reads=0;
  const mod=mockSource({graph:async(query)=>{reads++;
    assert.doesNotMatch(query,/has_saved_categories|selected_category_ids|expanded_category_ids|show_product_grid/);
    return {css_company_role_catalog_policy:role};
  }});
  const result=await mod.getEmployeeCataloguePolicy("TOKEN",20,33);
  assert.equal(result.catalogueScope,"COMPANY_INHERITED");
  assert.deepEqual(Array.from(result.skus),[]);
  assert.equal(reads,2,"unrestricted company grid is not enumerated or capped at 10,000 rows");
});
test("Incomplete, drifted and contradictory role reads never fall back to all products",async()=>{
  const mod=mockSource({});
  await assert.rejects(mod.readNativeRole(20,7,async n=>n===1?page(1,[a]):page(2,[b],{allowed_product_ids:[222]})));
  await assert.rejects(mod.readNativeRole(20,7,async n=>n===1?page(1,[a]):page(2,[])));
  const contradictory=page(1,[a],{
    has_saved_categories:false,show_product_grid:true,
    selected_category_ids:[],expanded_category_ids:[],
    preselect_all_products:true,
    allowed_product_ids:[111],products_count:1,
    products:{total_count:1,page:1,page_size:1,preselect_all:true,items:[a]},
  });
  await assert.rejects(mod.readNativeRole(20,7,async()=>contradictory));
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

test("Saved role products are enforced even when Hyva category restrictions are absent",async()=>{
  const mod=mockSource({});
  const byPage=n=>page(n,n===1?[a]:[b],{
    has_saved_categories:false,show_product_grid:true,
    selected_category_ids:[],expanded_category_ids:[],
  });
  const result=await mod.readNativeRole(20,7,async n=>byPage(n));
  assert.equal(result.catalogueScope,"EXPLICIT_SKUS");
  assert.deepEqual(Array.from(result.skus),["JACKET/01"]);
  assert.deepEqual(Array.from(result.productIds),[111]);
});

test("Hyva-only category selection never narrows a role without saved product restrictions",async()=>{
  const mod=mockSource({});
  const role=page(1,[a],{
    has_saved_categories:true,show_product_grid:true,
    selected_category_ids:[123],expanded_category_ids:[123,124],
    allowed_product_ids:[],products_count:0,preselect_all_products:true,
    products:{total_count:1,page:1,page_size:1,preselect_all:true,items:[a]},
  });
  const result=await mod.readNativeRole(20,7,async()=>role);
  assert.equal(result.catalogueScope,"COMPANY_INHERITED");
});

test("Restricted grid size and contradictory default-product claims still fail closed",async()=>{
  const mod=mockSource({});
  const oversized=page(1,[a],{
    products:{total_count:10001,page:1,page_size:1,preselect_all:false,items:[a]},
  });
  await assert.rejects(mod.readNativeRole(20,7,async()=>oversized),
    error=>error.qualificationReason==="ROLE_GRID_TOO_LARGE");

  const contradictory=page(1,[a],{
    has_saved_categories:false,show_product_grid:true,
    selected_category_ids:[],expanded_category_ids:[],
    allowed_product_ids:[111],products_count:1,preselect_all_products:true,
    products:{total_count:1,page:1,page_size:1,preselect_all:true,items:[a]},
  });
  await assert.rejects(mod.readNativeRole(20,7,async()=>contradictory),
    error=>error.qualificationReason==="ROLE_PRODUCT_POLICY_CONFLICT");

  const contradictoryFlag=page(1,[a],{allowed_product_ids:[],products_count:0,
    preselect_all_products:true,products:{total_count:1,page:1,page_size:1,preselect_all:false,items:[a]},
  });
  await assert.rejects(mod.readNativeRole(20,7,async()=>contradictoryFlag),
    error=>error.qualificationReason==="ROLE_PRODUCT_POLICY_CONFLICT");
});
test("Role mismatches retain their generic shopper message but a safe detailed operator code",async()=>{
  const mod=mockSource({
    graph:async()=>({css_company_role_catalog_policy:page(1,[a],{
      products:{total_count:10001,page:1,page_size:1,preselect_all:false,items:[a]},
    })}),
  });
  await assert.rejects(mod.getEmployeeCataloguePolicy("CUSTOMER_SECRET",20,33),
    error=>/ROLE_POLICY_UNQUALIFIED/.test(error.message)
      && !error.message.includes("ROLE_GRID_TOO_LARGE")
      && !error.message.includes("CUSTOMER_SECRET"));
});

test("Role-grid walk loads pages in bounded parallel groups without relaxing validation",async()=>{
  const mod=mockSource({});
  const selected=[1001,1012];
  let inFlight=0;
  let maxInFlight=0;
  const calls=[];
  const reader=async n=>{
    calls.push(n);
    inFlight++;
    maxInFlight=Math.max(maxInFlight,inFlight);
    await new Promise(resolve=>setTimeout(resolve,3));
    inFlight--;
    return {
      company_id:20,role_id:7,
      products_count:2,allowed_product_ids:selected,preselect_all_products:false,
      products:{total_count:12,page:n,page_size:1,preselect_all:false,
        items:[{id:1000+n,sku:"SKU-"+String(n).padStart(2,"0"),
          allowed:n===1||n===12}]},
    };
  };
  const result=await mod.readNativeRole(20,7,reader);
  assert.equal(result.catalogueScope,"EXPLICIT_SKUS");
  assert.deepEqual(Array.from(result.skus),["SKU-01","SKU-12"]);
  assert.deepEqual(Array.from(result.productIds),selected);
  assert.equal(calls.filter(n=>n===1).length,2,"independent first-page readback retained");
  assert.equal(new Set(calls).size,12,"all source pages read");
  assert.ok(maxInFlight>1,"pages are parallel rather than a sequential crawl");
  assert.ok(maxInFlight<=4,"never overload Magento with unbounded page fan-out");
});

test("Concurrent source page drift still fails closed",async()=>{
  const mod=mockSource({});
  const selected=[1001,1006];
  const reader=async n=>({
    company_id:20,role_id:n===4?8:7,
    products_count:2,allowed_product_ids:selected,preselect_all_products:false,
    products:{total_count:6,page:n,page_size:1,preselect_all:false,
      items:[{id:1000+n,sku:"SKU-"+n,allowed:n===1||n===6}]},
  });
  await assert.rejects(mod.readNativeRole(20,7,reader),
    error=>error.qualificationReason==="ROLE_IDENTITY_MISMATCH");
});

test("Selection only records an active company Employee; catalogue page still qualifies live role before browsing",()=>{
  const action=src("app/catalogue/actions.ts");
  const pageSource=src("app/catalogue/page.tsx");
  assert.match(action,/getActiveEmployees\(token\)/);
  assert.match(action,/employee\.company_id === mode\.companyId/);
  assert.match(action,/employee\.purchase_control_role_id/);
  assert.match(action,/setSelectedEmployee\(mode, employeeId, employee\.full_name\)/);
  assert.doesNotMatch(action,/getEmployeeCataloguePolicy\(/);
  assert.match(pageSource,/getEmployeeCataloguePolicy\(token, mode\.companyId, selectedEmployee\.employeeId\)/);
  assert.match(pageSource,/roleError/);
  assert.match(pageSource,/unstable_rethrow\(failure\)/);
});
