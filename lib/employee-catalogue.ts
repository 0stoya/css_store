import { cache } from "react";
import { cookies } from "next/headers";
import { magentoGraphQL } from "@/lib/magento/client";
import { getActiveEmployees } from "@/lib/magento/employee";
import { getCustomerCart } from "@/lib/magento/cart";
import { getEmployeeCataloguePolicy } from "@/lib/employee-catalogue-db";
import { readEmployeeSelection, signEmployeeSelection, type SelectedEmployee } from "@/lib/employee-catalogue-session";
import { assertEmployeeCartAllowed, assertEmployeeProductAllowed,
  employeeCatalogueApplies, type EmployeeCatalogueMode, type EmployeeCataloguePolicy,
} from "@/lib/employee-catalogue-policy";

const SELECTION_COOKIE = "css_store_employee_catalogue";

export function employeeCatalogueFeatureEnabled() {
  return process.env.CSS_STORE_EMPLOYEE_CATALOGUE_ENABLED === "1"
    && process.env.CSS_STORE_EMPLOYEE_CATALOGUE_SOURCE === "ROLE_CATALOGUE_V2";
}

const CONTEXT = /* GraphQL */ `
  query StoreEmployeeCatalogueMode {
    css_company_employee_configuration {
      company_id uses_employee multi_employee_basket
    }
    css_company_context { customer_id selected_company_id }
    css_ordering_capabilities {
      authenticated company_context company_active can_checkout
      company_id company_user_id
    }
  }
`;

// This function makes *no Magento or css_app call* when the global switch is
// off. Employees OFF / Open Purchasing OFF never touch css_app.
export const getEmployeeCatalogueMode = cache(async (token: string): Promise<EmployeeCatalogueMode | null> => {
  if (!employeeCatalogueFeatureEnabled()) return null;
  const data = await magentoGraphQL<{
    css_company_employee_configuration: {
      company_id: number; uses_employee: boolean;
      multi_employee_basket: boolean;
    };
    css_company_context: { customer_id: number | null; selected_company_id: number | null };
    css_ordering_capabilities: {
      authenticated: boolean; company_context: boolean; company_active: boolean;
      can_checkout: boolean; company_id: number | null; company_user_id: number | null;
    };
  }>(CONTEXT, {}, token);
  const config = data.css_company_employee_configuration;
  const ctx = data.css_company_context;
  const cap = data.css_ordering_capabilities;
  // Manager-only mode: scope is still authorised by Magento's existing
  // css_company_employees resolver, not an undeployed open-purchasing field.
  if (!employeeCatalogueApplies(true, { ...config, open_employee_purchasing: true },
    cap, ctx.selected_company_id, cap.company_id)) return null;
  if (!Number.isSafeInteger(ctx.customer_id) || !ctx.customer_id
    || !Number.isSafeInteger(cap.company_user_id) || !cap.company_user_id
    || config.company_id !== cap.company_id) {
    throw new Error("Employee catalogue company identity has changed.");
  }
  return {
    companyId: cap.company_id!,
    customerId: ctx.customer_id,
    companyUserId: cap.company_user_id,
    multiEmployeeBasket: config.multi_employee_basket,
  };
});

export async function getSelectedEmployee(mode: EmployeeCatalogueMode): Promise<SelectedEmployee | null> {
  return readEmployeeSelection((await cookies()).get(SELECTION_COOKIE)?.value,
    mode.customerId, mode.companyId);
}

export async function requireSelectedEmployee(mode: EmployeeCatalogueMode): Promise<SelectedEmployee> {
  const selected = await getSelectedEmployee(mode);
  if (!selected) {
    throw new Error("Choose an Employee before using the Employee purchasing catalogue.");
  }
  return selected;
}

export async function setSelectedEmployee(mode: EmployeeCatalogueMode, employeeId: number, name: string) {
  const payload = signEmployeeSelection({
    companyId: mode.companyId, customerId: mode.customerId,
    employeeId, name, createdAt: Date.now(),
  });
  (await cookies()).set(SELECTION_COOKIE, payload, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 8,
  });
}

export async function clearSelectedEmployee() {
  (await cookies()).delete(SELECTION_COOKIE);
}

export async function requireSelectedPolicy(token: string): Promise<{
  mode: EmployeeCatalogueMode;
  selected: SelectedEmployee;
  policy: EmployeeCataloguePolicy;
} | null> {
  const mode = await getEmployeeCatalogueMode(token);
  if (!mode) return null;
  const selected = await requireSelectedEmployee(mode);
  return { mode, selected, policy: await getEmployeeCataloguePolicy(mode.companyId, selected.employeeId) };
}

// Called *before* product/kit mutations. No Employee purchase context is
// trusted from a browser form. Only the signed selected-Employee cookie counts.
export async function assertEmployeeCatalogueProduct(token: string, sku: string, employeeId?: number) {
  const scope = await requireSelectedPolicy(token);
  if (!scope) return;
  if (employeeId !== undefined && employeeId !== scope.selected.employeeId) {
    throw new Error("The selected Employee changed. Choose the Employee again.");
  }
  // A signed selection is not permanent Employee membership: verify Magento's
  // current active buyer scope again immediately before mutating the cart.
  const active = await getActiveEmployees(token);
  if (!active.some((entry) => entry.employee_id === scope.selected.employeeId)) {
    throw new Error("The selected Employee is no longer active or available.");
  }
  assertEmployeeProductAllowed(scope.policy, sku);
}

// Revalidate an existing basket before reassigning it to another Employee.
export async function assertEmployeeCatalogueAssignment(token: string, employeeId: number, cartId: string, uid?: string) {
  const mode = await getEmployeeCatalogueMode(token);
  if (!mode) return;
  const selected = await requireSelectedEmployee(mode);
  if (selected.employeeId !== employeeId) {
    throw new Error("Change the shopping Employee before reassigning this basket.");
  }
  const active = await getActiveEmployees(token);
  if (!active.some((employee) => employee.employee_id === employeeId)) {
    throw new Error("The selected Employee is no longer available.");
  }
  const cart = await getCustomerCart(token);
  if (cart.id !== cartId) throw new Error("The basket changed. Review it again.");
  const policy = await getEmployeeCataloguePolicy(mode.companyId, employeeId);
  const relevant = uid
    ? cart.itemsV2.items.filter((item) => item.uid === uid)
    : cart.itemsV2.items;
  if (uid && !relevant.length) throw new Error("The basket line is no longer available.");
  const map = new Map([[employeeId, policy]]);
  assertEmployeeCartAllowed(relevant.map((item) => ({ ...item, css_employee: { employee_id: employeeId } })),
    map, new Set([employeeId]), false);
}

// Independent final gate. It uses the actual authenticated Magento cart,
// not stale browser input or the selected-Employee cookie's claimed contents.
export async function assertEmployeeCatalogueCartReady(token: string, expectedCartId: string) {
  const mode = await getEmployeeCatalogueMode(token);
  if (!mode) return;
  const selected = await requireSelectedEmployee(mode);
  const [cart, employees] = await Promise.all([getCustomerCart(token), getActiveEmployees(token)]);
  if (cart.id !== expectedCartId) throw new Error("The basket has changed during checkout.");
  const employeeIds = [...new Set(cart.itemsV2.items.map((line) =>
    line.css_employee?.employee_id ?? line.css_kit?.employee_id ?? null))];
  if (employeeIds.includes(null)) throw new Error("Choose an Employee for every basket line.");
  if (!mode.multiEmployeeBasket && employeeIds[0] !== selected.employeeId) {
    throw new Error("The shopping Employee changed. Reassign your basket before checkout.");
  }
  if (employeeIds.length > 50) throw new Error("Too many Employees in this basket.");
  const policies = new Map<number, EmployeeCataloguePolicy>();
  await Promise.all(employeeIds.map(async (id) => {
    if (id !== null) policies.set(id, await getEmployeeCataloguePolicy(mode.companyId, id));
  }));
  assertEmployeeCartAllowed(cart.itemsV2.items, policies,
    new Set(employees.map((employee) => employee.employee_id)), !mode.multiEmployeeBasket);
}
