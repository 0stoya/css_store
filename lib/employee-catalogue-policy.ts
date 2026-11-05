// Pure, runtime-independent gates. Employee Catalogue is additive only.
export type EmployeeCatalogueMode = {
  companyId: number;
  customerId: number;
  companyUserId: number;
  multiEmployeeBasket: boolean;
};

export type EmployeeCataloguePolicy = {
  companyId: number;
  employeeId: number;
  skus: string[];
  productIds: number[];
  sourceSha256: string;
  expiresAt: string;
};

export type EmployeeCatalogueCartLine = {
  uid: string;
  product: { sku: string; allowance_product_id?: number | null };
  display_parent_sku?: string | null;
  css_kit?: { employee_id: number | null; parent_kit_product_id: number } | null;
  css_employee?: { employee_id: number | null } | null;
};

export function employeeCatalogueApplies(featureEnabled: boolean, config: {
  uses_employee: boolean;
}, capabilities: {
  authenticated: boolean;
  company_context: boolean;
  company_active: boolean;
  can_checkout: boolean;
}, selectedCompany: number | null, companyId: number | null): boolean {
  // Existing Magento manager-scoped Employee ordering. Never widen company scope.
  if (!featureEnabled || !config.uses_employee) return false;
  // Unknown or inconsistent authority must never become an unrestricted mode.
  if (!capabilities.authenticated || !capabilities.company_context
    || !capabilities.company_active || !capabilities.can_checkout
    || !companyId || selectedCompany !== companyId) {
    throw new Error("Employee catalogue purchasing is unavailable for the selected company.");
  }
  return true;
}

export function assertEmployeeProductAllowed(policy: EmployeeCataloguePolicy, sku: string): void {
  if (!policy.skus.includes(sku)) {
    throw new Error("This product is not in the selected Employee's purchasing catalogue.");
  }
}

export function assertEmployeeCartAllowed(
  lines: EmployeeCatalogueCartLine[],
  policies: ReadonlyMap<number, EmployeeCataloguePolicy>,
  activeEmployeeIds: ReadonlySet<number>,
  singleEmployee: boolean,
): void {
  let onlyEmployee: number | null = null;
  for (const line of lines) {
    const id = line.css_employee?.employee_id ?? line.css_kit?.employee_id ?? null;
    if (!id || !activeEmployeeIds.has(id)) {
      throw new Error("Every basket line must belong to an active authorised Employee.");
    }
    if (singleEmployee) {
      if (onlyEmployee !== null && onlyEmployee !== id) {
        throw new Error("This company requires one Employee for the whole basket.");
      }
      onlyEmployee = id;
    }
    const policy = policies.get(id);
    if (!policy) throw new Error("An Employee's current catalogue is unavailable.");
    const productId = line.css_kit?.parent_kit_product_id || line.product.allowance_product_id || null;
    // Magento's 'logical product' may be a grouped/kit parent even when its
    // visible cart item has a child/variant SKU. Never accept a bare
    // parent name; IDs and SKUs here came from authenticated Magento cart.
    const permitted = (productId !== null && policy.productIds.includes(productId))
      || policy.skus.includes(line.product.sku)
      || (line.display_parent_sku !== null && line.display_parent_sku !== undefined
        && policy.skus.includes(line.display_parent_sku));
    if (!permitted) {
      throw new Error("Your basket contains a product outside an Employee's purchasing catalogue.");
    }
  }
}
