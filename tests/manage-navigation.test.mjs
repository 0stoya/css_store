import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const header = readFileSync("components/site-header.tsx", "utf8");
const probe = readFileSync("lib/magento/manage-navigation.ts", "utf8");

test("Manage is shown only for a signed-in customer with Magento manage rights", () => {
  assert.ok(header.includes("export async function SiteHeader("));
  assert.ok(header.includes("getCustomerToken()"));
  assert.ok(header.includes("canManageSelectedCompany(token)"));
  assert.ok(header.includes("{customerName && canManage ? <a"));
  assert.ok(header.includes("/api/auth/sso/start"));
  assert.ok(!header.includes("{customerName ? <a className=\"store-nav-link\" href="));
});

test("Manage probe uses the customer token and exact returned company-user identity", () => {
  assert.ok(probe.includes("query StoreCompanyManageNavigation"));
  assert.ok(probe.includes("css_company_manage_navigation"));
  assert.ok(probe.includes("MANAGE_NAVIGATION, {}, customerToken"));
  assert.ok(probe.includes("access?.can_manage === true"));
  assert.ok(probe.includes("Number.isSafeInteger(access.company_id)"));
  assert.ok(probe.includes("Number.isSafeInteger(access.company_user_id)"));
  assert.ok(!/role_name|role\.name|manager_id|localStorage|sessionStorage|isManager/.test(probe));
});

test("Missing backend capability fails closed, without swallowing expired-token redirects", () => {
  assert.ok(probe.includes("if (!customerToken) return false"));
  assert.ok(probe.includes("error instanceof MagentoGraphQLError"));
  assert.ok(probe.includes("return false"));
  assert.ok(probe.includes("throw error"));
  assert.ok(header.includes("{customerName ? <Link className=\"store-nav-link\" href=\"/account\""));
});
