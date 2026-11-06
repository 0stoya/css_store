import { createHash } from "node:crypto";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { magentoGraphQL } from "@/lib/magento/client";
import { getActiveEmployees } from "@/lib/magento/employee";
import type { EmployeeCataloguePolicy } from "@/lib/employee-catalogue-policy";

// Magento/Fluid owns the role, its live restrictions and the Employee.
// This module only reads using the authenticated BUYER token. No Staff token,
// PostgreSQL, scheduled capture or persistent Store-side entitlement cache.
const PAGE_LIMIT = 200;
const PRODUCT_LIMIT = 10000;
const SOURCE_MAX_MS = 120000;
const ROLE_QUERY = [
  "query StoreEmployeeRoleCatalogue($roleId: Int!, $page: Int!) {",
  " css_company_role_catalog_policy(role_id: $roleId, page: $page) {",
  "  company_id role_id selected_category_ids expanded_category_ids",
  "  has_saved_categories show_product_grid products_count",
  "  preselect_all_products allowed_product_ids",
  "  products { total_count page page_size preselect_all items { id sku allowed } }",
  " }",
  "}",
].join("\n");

type ProductRow = { id: number; sku: string; allowed: boolean };
type RolePolicyPage = {
  company_id: number; role_id: number;
  selected_category_ids: number[]; expanded_category_ids: number[];
  has_saved_categories: boolean; show_product_grid: boolean;
  products_count: number; preselect_all_products: boolean;
  allowed_product_ids: number[];
  products: { total_count: number; page: number; page_size: number;
    preselect_all: boolean; items: ProductRow[] };
};
const positive = (id: number): boolean => Number.isSafeInteger(id) && id > 0;

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error("Magento Employee Role catalogue could not be qualified.");
}

function metadata(policy: RolePolicyPage) {
  return {
    company: policy.company_id, role: policy.role_id,
    categories: [...policy.selected_category_ids].sort((a,b) => a-b),
    expanded: [...policy.expanded_category_ids].sort((a,b) => a-b),
    saved: policy.has_saved_categories, grid: policy.show_product_grid,
    count: policy.products_count, preselect: policy.preselect_all_products,
    selected: [...policy.allowed_product_ids].sort((a,b) => a-b),
    total: policy.products.total_count, size: policy.products.page_size,
    pagePreselect: policy.products.preselect_all,
  };
}

function signature(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function checkNativeRolePage(
  policy: RolePolicyPage, companyId: number, roleId: number,
  pageNumber: number, originalSignature?: string,
): string {
  requireValid(policy?.company_id === companyId && policy.role_id === roleId
    && positive(companyId) && positive(roleId)
    && typeof policy.has_saved_categories === "boolean"
    && typeof policy.show_product_grid === "boolean"
    && typeof policy.preselect_all_products === "boolean"
    && Array.isArray(policy.selected_category_ids)
    && Array.isArray(policy.expanded_category_ids)
    && Array.isArray(policy.allowed_product_ids)
    && policy.selected_category_ids.every(positive)
    && policy.expanded_category_ids.every(positive)
    && policy.allowed_product_ids.every(positive)
    && new Set(policy.allowed_product_ids).size === policy.allowed_product_ids.length
    && Number.isSafeInteger(policy.products_count) && policy.products_count >= 0
    && policy.products && Array.isArray(policy.products.items)
    && policy.products.page === pageNumber
    && Number.isSafeInteger(policy.products.total_count) && policy.products.total_count >= 0
    && policy.products.total_count <= PRODUCT_LIMIT
    && Number.isSafeInteger(policy.products.page_size)
    && policy.products.page_size >= 1 && policy.products.page_size <= 200
    && typeof policy.products.preselect_all === "boolean"
    && policy.products.items.length === Math.min(
      policy.products.page_size,
      Math.max(0, policy.products.total_count - (pageNumber - 1) * policy.products.page_size)
    ));
  const seenIds = new Set<number>();
  const seenSkus = new Set<string>();
  for (const item of policy.products.items) {
    requireValid(positive(item?.id) && typeof item.sku === "string"
      && item.sku.length > 0 && item.sku.length <= 128 && item.sku.trim() === item.sku
      && !/[\u0000-\u001f\u007f]/u.test(item.sku)
      && typeof item.allowed === "boolean"
      && !seenIds.has(item.id) && !seenSkus.has(item.sku));
    seenIds.add(item.id);
    seenSkus.add(item.sku);
  }
  const current = signature(metadata(policy));
  requireValid(!originalSignature || current === originalSignature);
  return current;
}

export async function readNativeRole(
  companyId: number, roleId: number,
  read: (page: number) => Promise<RolePolicyPage>,
): Promise<Pick<EmployeeCataloguePolicy, "catalogueScope" | "skus" | "productIds">> {
  const started = Date.now();
  const first = await read(1);
  const firstSignature = checkNativeRolePage(first, companyId, roleId, 1);
  if (!first.has_saved_categories) {
    // A role with NO saved restrictions inherits the logged-in buyer's live
    // Magento company catalogue. Never interpret a failed or empty query as ALL.
    requireValid(first.selected_category_ids.length === 0
      && first.expanded_category_ids.length === 0
      && first.allowed_product_ids.length === 0
      && first.products_count === 0 && !first.show_product_grid
      && first.products.total_count === 0 && first.products.items.length === 0);
    const again = await read(1);
    checkNativeRolePage(again, companyId, roleId, 1, firstSignature);
    requireValid(signature(again.products.items) === signature(first.products.items));
    return { catalogueScope: "COMPANY_INHERITED", skus: [], productIds: [] };
  }
  requireValid(first.show_product_grid && first.selected_category_ids.length > 0);
  const pageCount = Math.max(1, Math.ceil(first.products.total_count / first.products.page_size));
  requireValid(pageCount <= PAGE_LIMIT);
  const allowed: ProductRow[] = [...first.products.items.filter(item => item.allowed)];
  const allIds = new Set(first.products.items.map(item => item.id));
  const allSkus = new Set(first.products.items.map(item => item.sku));
  for (let page = 2; page <= pageCount; page++) {
    const next = await read(page);
    checkNativeRolePage(next, companyId, roleId, page, firstSignature);
    for (const item of next.products.items) {
      requireValid(!allIds.has(item.id) && !allSkus.has(item.sku));
      allIds.add(item.id);
      allSkus.add(item.sku);
      if (item.allowed) allowed.push(item);
    }
  }
  const readback = await read(1);
  checkNativeRolePage(readback, companyId, roleId, 1, firstSignature);
  requireValid(signature(readback.products.items) === signature(first.products.items));
  if (!first.preselect_all_products) {
    const selected = new Set(first.allowed_product_ids);
    const actual = new Set(allowed.map(item => item.id));
    requireValid(actual.size === selected.size
      && [...selected].every(id => actual.has(id)));
  } else {
    requireValid(allowed.length === first.products.total_count);
  }
  requireValid(Date.now() - started <= SOURCE_MAX_MS);
  allowed.sort((a,b) => a.sku.localeCompare(b.sku, "en"));
  return { catalogueScope: "EXPLICIT_SKUS",
    skus: allowed.map(item => item.sku), productIds: allowed.map(item => item.id) };
}

// Classify *only* safe operational details. Never log a customer token, raw
// GraphQL error message, role-product payload or Employee personal data.
type NativeRoleStage = "EMPLOYEE_DIRECTORY" | "EMPLOYEE_ASSIGNMENT" | "ROLE_POLICY";
type NativeRoleFailure = Error & { diagnosticCode?: string; category?: string; status?: number };

export function classifyNativeRoleFailure(error: unknown, stage: NativeRoleStage): string {
  const value = error && typeof error === "object" ? error as NativeRoleFailure : null;
  if (value?.diagnosticCode === "EMPLOYEE_NOT_IN_SCOPE") return "EMPLOYEE_NOT_IN_SCOPE";
  if (value?.diagnosticCode === "EMPLOYEE_ROLE_UNASSIGNED") return "EMPLOYEE_ROLE_UNASSIGNED";
  const category = value?.category?.toLowerCase();
  if (stage === "ROLE_POLICY" && (category === "graphql-authorization" || value?.status === 403)) {
    return "ROLE_POLICY_ACCESS_DENIED";
  }
  if (category === "graphql-authentication" || value?.status === 401) return "MAGENTO_SESSION_UNAVAILABLE";
  if (stage === "ROLE_POLICY" && value?.message === "Magento Employee Role catalogue could not be qualified.") {
    return "ROLE_POLICY_UNQUALIFIED";
  }
  return stage === "EMPLOYEE_DIRECTORY" ? "EMPLOYEE_DIRECTORY_UNAVAILABLE" : "ROLE_POLICY_UNAVAILABLE";
}

function sourceError(code: "EMPLOYEE_NOT_IN_SCOPE" | "EMPLOYEE_ROLE_UNASSIGNED"): never {
  throw Object.assign(new Error("Employee's native Magento Role is unavailable."), { diagnosticCode: code });
}

// Request-scoped memoization avoids repeated page walks within one browser
// request. Never persists a role entitlement across requests or role changes.
export const getEmployeeCataloguePolicy = cache(async (
  token: string, companyId: number, employeeId: number,
): Promise<EmployeeCataloguePolicy> => {
  if (!positive(companyId) || !positive(employeeId)) {
    throw new Error("Invalid Employee company or identity.");
  }
  let stage: NativeRoleStage = "EMPLOYEE_DIRECTORY";
  try {
    const employees = await getActiveEmployees(token);
    stage = "EMPLOYEE_ASSIGNMENT";
    const employee = employees.find(row => row.employee_id === employeeId
      && row.company_id === companyId);
    if (!employee) sourceError("EMPLOYEE_NOT_IN_SCOPE");
    if (!positive(employee.purchase_control_role_id ?? 0)) sourceError("EMPLOYEE_ROLE_UNASSIGNED");
    const roleId = employee.purchase_control_role_id!;
    stage = "ROLE_POLICY";
    const qualified = await readNativeRole(companyId, roleId, async page => {
      const data = await magentoGraphQL<{
        css_company_role_catalog_policy: RolePolicyPage;
      }>(ROLE_QUERY, { roleId, page }, token);
      return data.css_company_role_catalog_policy;
    });
    return { companyId, employeeId, roleId, ...qualified };
  } catch (error) {
    // Preserve Next.js redirects (expired Magento sessions) instead of
    // replacing those with a misleading catalogue restriction error.
    unstable_rethrow(error);
    const code = classifyNativeRoleFailure(error, stage);
    const source = error && typeof error === "object" ? error as NativeRoleFailure : null;
    const category = source?.category === "graphql-authorization" ? "authorization"
      : source?.category === "graphql-authentication" ? "authentication" : "other";
    const status = Number.isInteger(source?.status) ? source!.status : 0;
    console.warn(`[employee-role] code=${code} stage=${stage} category=${category} http=${status}`);
    // The user already has access to the selected Employee directory;
    // expose only the absence of a native role, never raw Magento details.
    if (code === "EMPLOYEE_ROLE_UNASSIGNED") {
      throw new Error("This Employee has no Magento Purchase Role assigned. Ask your company administrator to assign one.");
    }
    throw new Error(`Employee catalogue restrictions cannot be verified in Magento (reference: ${code}).`);
  }
});
