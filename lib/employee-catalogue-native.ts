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
  "  company_id role_id products_count preselect_all_products allowed_product_ids",
  "  products { total_count page page_size preselect_all items { id sku allowed } }",
  " }",
  "}",
].join("\n");

type ProductRow = { id: number; sku: string; allowed: boolean };
type RolePolicyPage = {
  company_id: number; role_id: number;
  products_count: number; preselect_all_products: boolean;
  allowed_product_ids: number[];
  products: { total_count: number; page: number; page_size: number;
    preselect_all: boolean; items: ProductRow[] };
};
const positive = (id: number): boolean => Number.isSafeInteger(id) && id > 0;

type QualificationReason =
  | "ROLE_IDENTITY_MISMATCH"
  | "ROLE_METADATA_INVALID"
  | "ROLE_GRID_SHAPE_INVALID"
  | "ROLE_GRID_TOO_LARGE"
  | "ROLE_GRID_PAGE_INVALID"
  | "ROLE_GRID_PRODUCT_INVALID"
  | "ROLE_GRID_PRODUCT_DUPLICATE"
  | "ROLE_POLICY_CHANGED"
  | "ROLE_PRODUCT_POLICY_CONFLICT"
  | "ROLE_GRID_PAGE_LIMIT"
  | "ROLE_GRID_MEMBERSHIP_DUPLICATE"
  | "ROLE_FIRST_PAGE_CHANGED"
  | "ROLE_SELECTED_PRODUCT_MISMATCH"
  | "ROLE_DEFAULT_PRODUCT_MISMATCH"
  | "ROLE_SOURCE_TOO_OLD";

function requireValid(condition: unknown, qualificationReason: QualificationReason): asserts condition {
  if (!condition) throw Object.assign(
    new Error("Magento Employee Role catalogue could not be qualified."),
    { qualificationReason },
  );
}

function metadata(policy: RolePolicyPage) {
  return {
    company: policy.company_id, role: policy.role_id,
    // Hyva category restrictions are a separate frontend-only scope; the
    // headless Store uses the role's independent product policy.
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
    && positive(companyId) && positive(roleId), "ROLE_IDENTITY_MISMATCH");
  requireValid(typeof policy.preselect_all_products === "boolean"
    && Array.isArray(policy.allowed_product_ids)
    && policy.allowed_product_ids.every(positive)
    && new Set(policy.allowed_product_ids).size === policy.allowed_product_ids.length
    && Number.isSafeInteger(policy.products_count) && policy.products_count >= 0,
    "ROLE_METADATA_INVALID");
  // On Fluid's headless compatibility contract, the persisted role product
  // count/IDs must reconcile independently of saved Hyva categories.
  requireValid(policy.products_count === policy.allowed_product_ids.length,
    "ROLE_PRODUCT_POLICY_CONFLICT");
  requireValid(Boolean(policy.products) && Array.isArray(policy.products.items),
    "ROLE_GRID_SHAPE_INVALID");
  requireValid(Number.isSafeInteger(policy.products.total_count)
    && policy.products.total_count >= 0, "ROLE_GRID_SHAPE_INVALID");
  requireValid(policy.products.page === pageNumber
    && Number.isSafeInteger(policy.products.page_size)
    && policy.products.page_size >= 1 && policy.products.page_size <= 200
    && typeof policy.products.preselect_all === "boolean"
    && policy.products.items.length === Math.min(
      policy.products.page_size,
      Math.max(0, policy.products.total_count - (pageNumber - 1) * policy.products.page_size)
    ), "ROLE_GRID_PAGE_INVALID");
  const seenIds = new Set<number>();
  const seenSkus = new Set<string>();
  for (const item of policy.products.items) {
    requireValid(positive(item?.id) && typeof item.sku === "string"
      && item.sku.length > 0 && item.sku.length <= 128 && item.sku.trim() === item.sku
      && !/[\u0000-\u001f\u007f]/u.test(item.sku)
      && typeof item.allowed === "boolean", "ROLE_GRID_PRODUCT_INVALID");
    requireValid(!seenIds.has(item.id) && !seenSkus.has(item.sku),
      "ROLE_GRID_PRODUCT_DUPLICATE");
    seenIds.add(item.id);
    seenSkus.add(item.sku);
  }
  const current = signature(metadata(policy));
  requireValid(!originalSignature || current === originalSignature, "ROLE_POLICY_CHANGED");
  return current;
}

export async function readNativeRole(
  companyId: number, roleId: number,
  read: (page: number) => Promise<RolePolicyPage>,
): Promise<Pick<EmployeeCataloguePolicy, "catalogueScope" | "skus" | "productIds">> {
  const started = Date.now();
  const first = await read(1);
  const firstSignature = checkNativeRolePage(first, companyId, roleId, 1);
  // Magento/Fluid keeps Hyva category selection independent of the native
  // role's *product* restriction. An empty category selection is NOT proof
  // that product restrictions are absent. Use only the independently saved
  // product IDs/count plus the headless company-bound product-grid flags.
  // A role with no saved product restriction inherits the authenticated
  // buyer's live Magento company catalogue, regardless of Hyva categories.
  if (first.preselect_all_products) {
    requireValid(first.products.preselect_all
      && first.products_count === 0 && first.allowed_product_ids.length === 0
      && first.products.items.every(item => item.allowed),
      "ROLE_PRODUCT_POLICY_CONFLICT");
    // No SKU list is needed in inherited mode: company and buyer visibility
    // remain enforced by Magento on every product browse and cart request.
    // Only the first page is read twice, even for a large company catalogue.
    const again = await read(1);
    checkNativeRolePage(again, companyId, roleId, 1, firstSignature);
    requireValid(signature(again.products.items) === signature(first.products.items),
      "ROLE_FIRST_PAGE_CHANGED");
    return { catalogueScope: "COMPANY_INHERITED", skus: [], productIds: [] };
  }
  // A saved product allowlist is never replaced by inherited access just
  // because no Hyva categories were selected. Inconsistencies fail closed.
  requireValid(!first.products.preselect_all && first.products_count > 0,
    "ROLE_PRODUCT_POLICY_CONFLICT");
  requireValid(first.products.total_count <= PRODUCT_LIMIT, "ROLE_GRID_TOO_LARGE");
  const pageCount = Math.max(1, Math.ceil(first.products.total_count / first.products.page_size));
  requireValid(pageCount <= PAGE_LIMIT, "ROLE_GRID_PAGE_LIMIT");
  const allowed: ProductRow[] = [...first.products.items.filter(item => item.allowed)];
  const allIds = new Set(first.products.items.map(item => item.id));
  const allSkus = new Set(first.products.items.map(item => item.sku));
  for (let page = 2; page <= pageCount; page++) {
    const next = await read(page);
    checkNativeRolePage(next, companyId, roleId, page, firstSignature);
    for (const item of next.products.items) {
      requireValid(!allIds.has(item.id) && !allSkus.has(item.sku),
        "ROLE_GRID_MEMBERSHIP_DUPLICATE");
      allIds.add(item.id);
      allSkus.add(item.sku);
      if (item.allowed) allowed.push(item);
    }
  }
  const readback = await read(1);
  checkNativeRolePage(readback, companyId, roleId, 1, firstSignature);
  requireValid(signature(readback.products.items) === signature(first.products.items),
    "ROLE_FIRST_PAGE_CHANGED");
  if (!first.preselect_all_products) {
    const selected = new Set(first.allowed_product_ids);
    const actual = new Set(allowed.map(item => item.id));
    requireValid(actual.size === selected.size
      && [...selected].every(id => actual.has(id)), "ROLE_SELECTED_PRODUCT_MISMATCH");
  } else {
    requireValid(allowed.length === first.products.total_count,
      "ROLE_DEFAULT_PRODUCT_MISMATCH");
  }
  requireValid(Date.now() - started <= SOURCE_MAX_MS, "ROLE_SOURCE_TOO_OLD");
  allowed.sort((a,b) => a.sku.localeCompare(b.sku, "en"));
  return { catalogueScope: "EXPLICIT_SKUS",
    skus: allowed.map(item => item.sku), productIds: allowed.map(item => item.id) };
}

// Classify *only* safe operational details. Never log a customer token, raw
// GraphQL error message, role-product payload or Employee personal data.
type NativeRoleStage = "EMPLOYEE_DIRECTORY" | "EMPLOYEE_ASSIGNMENT" | "ROLE_POLICY";
type NativeRoleFailure = Error & {
  diagnosticCode?: string;
  qualificationReason?: QualificationReason;
  category?: string;
  status?: number;
};

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
    const detail = code === "ROLE_POLICY_UNQUALIFIED" && source?.qualificationReason
      ? source.qualificationReason : "NONE";
    console.warn(`[employee-role] code=${code} detail=${detail} stage=${stage} category=${category} http=${status}`);
    // The user already has access to the selected Employee directory;
    // expose only the absence of a native role, never raw Magento details.
    if (code === "EMPLOYEE_ROLE_UNASSIGNED") {
      throw new Error("This Employee has no Magento Purchase Role assigned. Ask your company administrator to assign one.");
    }
    throw new Error(`Employee catalogue restrictions cannot be verified in Magento (reference: ${code}).`);
  }
});
