import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { magentoGraphQL } from "@/lib/magento/client";
import type { EmployeeCataloguePolicy } from "@/lib/employee-catalogue-policy";

// Fluid #122: a live, read-only Magento CUSTOMER-token query. Magento verifies
// the buyer, selected company, active Employee and assigned Purchase Role.
// Unlike the legacy role-policy editor, it requires no catalogue-management ACL
// and never walks the company's product grid (50 products per page).
const EFFECTIVE_EMPLOYEE_CATALOGUE = [
  "query StoreEffectiveEmployeeCatalogue($employeeId: Int!) {",
  " css_effective_catalogue_products(employee_id: $employeeId) {",
  "  company_id company_user_id employee_id role_ids scope",
  "  products { id sku }",
  " }",
  "}",
].join("\n");

const MAX_EFFECTIVE_PRODUCTS = 10000;

type EffectiveCatalogueResponse = {
  company_id: number;
  company_user_id: number;
  employee_id: number | null;
  role_ids: number[];
  scope: "EXPLICIT_SKUS" | "COMPANY_INHERITED";
  products: Array<{ id: number; sku: string }>;
};

const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

type QualificationReason =
  | "EFFECTIVE_SCOPE_IDENTITY_MISMATCH"
  | "EFFECTIVE_SCOPE_ROLE_INVALID"
  | "EFFECTIVE_SCOPE_INVALID"
  | "EFFECTIVE_SCOPE_PRODUCT_INVALID"
  | "EFFECTIVE_SCOPE_PRODUCT_DUPLICATE"
  | "EFFECTIVE_SCOPE_TOO_LARGE"
  | "EFFECTIVE_SCOPE_INHERITED_PRODUCTS";

function requireValid(condition: unknown, qualificationReason: QualificationReason): asserts condition {
  if (!condition) {
    throw Object.assign(
      new Error("Magento Employee catalogue could not be qualified."),
      { qualificationReason },
    );
  }
}

// Strictly validate the one-shot Magento contract before it influences
// product browse, add-to-basket, reassignment or checkout. Never interpret a
// malformed / explicitly empty list as inherited company-wide access.
export function qualifyEffectiveEmployeeCatalogue(
  payload: unknown,
  companyId: number,
  employeeId: number,
): Pick<EmployeeCataloguePolicy, "roleId" | "catalogueScope" | "skus" | "productIds"> {
  requireValid(Boolean(payload) && typeof payload === "object" && !Array.isArray(payload),
    "EFFECTIVE_SCOPE_INVALID");
  const value = payload as EffectiveCatalogueResponse;

  requireValid(positive(companyId) && positive(employeeId)
    && value.company_id === companyId
    && positive(value.company_user_id)
    && value.employee_id === employeeId,
  "EFFECTIVE_SCOPE_IDENTITY_MISMATCH");

  requireValid(Array.isArray(value.role_ids)
    && value.role_ids.length === 1
    && positive(value.role_ids[0]),
  "EFFECTIVE_SCOPE_ROLE_INVALID");

  requireValid(
    (value.scope === "EXPLICIT_SKUS" || value.scope === "COMPANY_INHERITED")
    && Array.isArray(value.products),
    "EFFECTIVE_SCOPE_INVALID",
  );
  requireValid(value.products.length <= MAX_EFFECTIVE_PRODUCTS, "EFFECTIVE_SCOPE_TOO_LARGE");

  if (value.scope === "COMPANY_INHERITED") {
    requireValid(value.products.length === 0, "EFFECTIVE_SCOPE_INHERITED_PRODUCTS");
    return { roleId: value.role_ids[0], catalogueScope: "COMPANY_INHERITED",
      skus: [], productIds: [] };
  }

  const ids = new Set<number>();
  const skuKeys = new Set<string>();
  const products: Array<{ id: number; sku: string }> = [];
  for (const item of value.products) {
    requireValid(Boolean(item) && typeof item === "object"
      && positive(item.id)
      && typeof item.sku === "string"
      && item.sku.length > 0 && item.sku.length <= 128
      && item.sku.trim() === item.sku
      && !/[\u0000-\u001f\u007f]/u.test(item.sku), "EFFECTIVE_SCOPE_PRODUCT_INVALID");
    const skuKey = item.sku.toLowerCase();
    requireValid(!ids.has(item.id) && !skuKeys.has(skuKey),
      "EFFECTIVE_SCOPE_PRODUCT_DUPLICATE");
    ids.add(item.id);
    skuKeys.add(skuKey);
    products.push({ id: item.id, sku: item.sku });
  }

  products.sort((a, b) => a.sku.localeCompare(b.sku, "en"));
  return {
    roleId: value.role_ids[0],
    catalogueScope: "EXPLICIT_SKUS",
    skus: products.map(product => product.sku),
    productIds: products.map(product => product.id),
  };
}

// Safe diagnostics only. Never log tokens, Employee identity, raw Magento
// GraphQL errors or the actual product list.
type CatalogueFailure = Error & {
  qualificationReason?: QualificationReason;
  category?: string;
  status?: number;
};

export function classifyNativeRoleFailure(error: unknown): string {
  const value = error && typeof error === "object" ? error as CatalogueFailure : null;
  if (value?.qualificationReason) return "ROLE_POLICY_UNQUALIFIED";
  const category = value?.category?.toLowerCase();
  if (category === "graphql-authentication" || value?.status === 401) {
    return "MAGENTO_SESSION_UNAVAILABLE";
  }
  if (category === "graphql-authorization" || value?.status === 403) {
    return "EMPLOYEE_SCOPE_ACCESS_DENIED";
  }
  return "ROLE_POLICY_UNAVAILABLE";
}

// React cache is request-local only. Role/Employee changes take effect on the
// next request; there is no shared Store cache or saved entitlement snapshot.
export const getEmployeeCataloguePolicy = cache(async (
  token: string, companyId: number, employeeId: number,
): Promise<EmployeeCataloguePolicy> => {
  if (!positive(companyId) || !positive(employeeId)) {
    throw new Error("Invalid Employee company or identity.");
  }

  try {
    const data = await magentoGraphQL<{
      css_effective_catalogue_products: EffectiveCatalogueResponse;
    }>(EFFECTIVE_EMPLOYEE_CATALOGUE, { employeeId }, token);

    const qualified = qualifyEffectiveEmployeeCatalogue(
      data.css_effective_catalogue_products, companyId, employeeId,
    );
    return { companyId, employeeId, ...qualified };
  } catch (error) {
    // Keep Next.js's actual expired-session redirects intact.
    unstable_rethrow(error);

    const code = classifyNativeRoleFailure(error);
    const source = error && typeof error === "object" ? error as CatalogueFailure : null;
    const detail = code === "ROLE_POLICY_UNQUALIFIED"
      ? source?.qualificationReason ?? "UNKNOWN" : "NONE";
    const category = source?.category === "graphql-authorization" ? "authorization"
      : source?.category === "graphql-authentication" ? "authentication" : "other";
    const status = Number.isInteger(source?.status) ? source!.status : 0;
    console.warn("[employee-role] code=" + code + " detail=" + detail
      + " stage=EFFECTIVE_SCOPE category=" + category + " http=" + status);
    throw new Error(
      "Employee catalogue restrictions cannot be verified in Magento (reference: " + code + ").",
    );
  }
});
