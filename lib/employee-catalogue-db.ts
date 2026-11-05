import postgres from "postgres";
import type { EmployeeCataloguePolicy } from "@/lib/employee-catalogue-policy";

declare global {
  var __cssStoreEmployeeCatalogueSql: ReturnType<typeof postgres> | undefined;
}

function sqlClient() {
  const dsn = process.env.CSS_STORE_EMPLOYEE_CATALOGUE_DATABASE_URL;
  if (!dsn?.trim()) throw new Error("Employee catalogue data is not configured.");
  if (!globalThis.__cssStoreEmployeeCatalogueSql) {
    globalThis.__cssStoreEmployeeCatalogueSql = postgres(dsn, {
      max: 2, idle_timeout: 10, connect_timeout: 5,
      max_lifetime: 60, prepare: false,
      connection: { default_transaction_read_only: true },
    });
  }
  return globalThis.__cssStoreEmployeeCatalogueSql;
}

export async function getEmployeeCataloguePolicy(companyId: number, employeeId: number): Promise<EmployeeCataloguePolicy> {
  if (![companyId, employeeId].every((v) => Number.isSafeInteger(v) && v > 0)) {
    throw new Error("Invalid Employee catalogue context.");
  }
  try {
    // Dedicated, read-only CSS Admin PostgreSQL role, V2 Catalogue Role contract only.
    // The earlier allowance-based projection must NEVER determine browse visibility.
    // Never access CSS Admin tables or reuse Staff/Magento credentials.
    const rows = await sqlClient()`
      SELECT css_admin.read_employee_role_catalogue_v2(
        ${companyId}::bigint, ${employeeId}::bigint
      ) AS policy
    `;
    const data = rows[0]?.policy as Record<string, unknown> | undefined;
    if (data?.state !== "READY") {
      throw new Error("The selected Employee's purchasing catalogue is not ready.");
    }
    const skus = data.skus;
    const productIds = data.product_ids;
    const expiresAt = data.expires_at;
    const hash = data.source_sha256;
    const sourceContract = data.source_contract;
    const roleId = data.role_id;
    if (sourceContract !== "MAGENTO_ROLE_CATALOGUE_VISIBILITY_V2"
      || !Number.isSafeInteger(roleId) || Number(roleId) <= 0
      || !Array.isArray(skus) || !Array.isArray(productIds) || skus.length !== productIds.length
      || skus.length > 2000 || data.count !== skus.length
      || new Set(skus).size !== skus.length || new Set(productIds).size !== productIds.length
      || !skus.every((sku) => typeof sku === "string" && sku.length > 0 && sku.length <= 128)
      || !productIds.every((id) => Number.isSafeInteger(id) && id > 0)
      || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)
      || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))
      || Date.parse(expiresAt) <= Date.now()) {
      throw new Error("The Employee catalogue source is invalid or has expired.");
    }
    return { companyId, employeeId, skus: skus as string[],
      productIds: productIds as number[], sourceSha256: hash, expiresAt };
  } catch {
    // Database credentials, SQL state, source account IDs and raw errors are
    // never sent to the buyer. No 'show everything' recovery for this mode.
    throw new Error("Employee purchasing catalogue is temporarily unavailable. Contact your company administrator.");
  }
}
