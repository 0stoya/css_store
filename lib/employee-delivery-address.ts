import postgres from "postgres";

declare global {
  var __cssStoreEmployeeAddressSql: ReturnType<typeof postgres> | undefined;
}

export function employeeAddressMappingConfigured() {
  return Boolean(process.env.CSS_STORE_EMPLOYEE_ADDRESS_DATABASE_URL?.trim());
}

function getEmployeeAddressSql() {
  const connectionString = process.env.CSS_STORE_EMPLOYEE_ADDRESS_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("Employee address lookup is not configured.");
  if (!globalThis.__cssStoreEmployeeAddressSql) {
    globalThis.__cssStoreEmployeeAddressSql = postgres(connectionString, {
      max: 2,
      connect_timeout: 3,
      idle_timeout: 20,
      prepare: false,
    });
  }
  return globalThis.__cssStoreEmployeeAddressSql;
}

export function chooseOwnedSavedAddress(storedId: number | null, savedAddressIds: number[]) {
  if (!Number.isSafeInteger(storedId) || storedId === null || storedId <= 0) return null;
  return savedAddressIds.includes(storedId) ? storedId : null;
}

// Caller derives company/customer identities from the authenticated Magento
// session and checks active Employee scope using existing GraphQL.
// This DB connection must have SELECT on one table only, never write access.
export async function getAssignedEmployeeDeliveryAddress(
  companyId: number,
  ownerCustomerId: number,
  employeeId: number,
): Promise<number | null> {
  for (const id of [companyId, ownerCustomerId, employeeId]) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid employee address lookup scope.");
  }
  const sql = getEmployeeAddressSql();
  const rows = await sql`
    SELECT customer_address_id
    FROM css_admin.employee_delivery_address_assignment
    WHERE company_id = ${companyId}
      AND owner_customer_id = ${ownerCustomerId}
      AND employee_id = ${employeeId}
    LIMIT 1
  `;
  return rows[0] ? Number(rows[0].customer_address_id) : null;
}

// One opt-in company flag in Admin's existing PostgreSQL schema. Read with
// the same restricted Store connection as the Employee-to-address mapping.
// A missing row is OFF. Missing table/permission/connection throws and fails
// closed instead of exposing unrestricted delivery.
export async function getControlledEmployeeDeliveryEnabled(companyId: number): Promise<boolean> {
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new Error("Invalid company ID for controlled Employee delivery.");
  }
  const sql = getEmployeeAddressSql();
  const rows = await sql`
    SELECT controlled_delivery_enabled
    FROM css_admin.company_employee_delivery_policy
    WHERE company_id = ${companyId}
    LIMIT 1
  `;
  return rows[0]?.controlled_delivery_enabled === true;
}
