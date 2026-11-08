import { magentoGraphQL } from "@/lib/magento/client";

// The new purchase-only query is opt-in per Store deployment until the
// connected Magento PHP, schema and DB are qualified. When disabled, do not
// request a field that an older production Magento may not yet expose.
export function openEmployeePurchasingApiEnabled(): boolean {
  return process.env.CSS_STORE_OPEN_EMPLOYEE_PURCHASING_ENABLED === "1";
}

export type StoreEmployee = {
  employee_id: number;
  company_id: number | null;
  purchase_control_role_id: number | null;
  employee_code: string | null;
  full_name: string;
  department: string | null;
};

export type EmployeeOrdering = {
  usesEmployee: boolean;
  multiEmployeeBasket: boolean;
  employees: StoreEmployee[];
};

const EMPLOYEE_CONFIGURATION = /* GraphQL */ `
  query StoreEmployeeConfiguration {
    css_company_employee_configuration {
      company_id
      uses_employee
      multi_employee_basket
    }
  }
`;

// Legacy directory is retained unchanged for older Magento deployments.
const ACTIVE_EMPLOYEES = /* GraphQL */ `
  query StoreActiveEmployees($page: Int!) {
    css_company_employees(currentPage: $page, pageSize: 200, active: true) {
      items { employee_id company_id purchase_control_role_id employee_code full_name department active }
      page_info { current_page total_pages }
    }
  }
`;

// Fluid #119: purchase-only scope, no Employee HR, finance, manager ID,
// company or role-management data. Magento verifies selected company,
// actual buyer checkout entitlement and the current Open setting.
const BUYABLE_EMPLOYEES = /* GraphQL */ `
  query StoreBuyableEmployees($page: Int!) {
    css_company_buyable_employees(currentPage: $page, pageSize: 200) {
      total_count
      items { employee_id employee_code full_name department }
      page_info { current_page total_pages }
    }
  }
`;

type BuyableEmployee = Pick<StoreEmployee,
  "employee_id" | "employee_code" | "full_name" | "department">;

function validatePage(
  pageInfo: { current_page: number; total_pages: number },
  page: number,
  itemsLength: number,
): void {
  if (!pageInfo
    || !Number.isSafeInteger(pageInfo.current_page)
    || !Number.isSafeInteger(pageInfo.total_pages)
    || pageInfo.current_page !== page
    || pageInfo.total_pages < 0
    || pageInfo.total_pages > 50
    || (pageInfo.total_pages === 0 && itemsLength !== 0)
    || (pageInfo.total_pages !== 0 && page > pageInfo.total_pages)) {
    throw new Error("The Employee list is too large or its pagination changed. Contact your account administrator.");
  }
}

export async function getActiveEmployees(token: string): Promise<StoreEmployee[]> {
  const buyableMode = openEmployeePurchasingApiEnabled();
  const employees: StoreEmployee[] = [];
  const seen = new Set<number>();

  for (let page = 1; page <= 50; page += 1) {
    if (buyableMode) {
      const data = await magentoGraphQL<{
        css_company_buyable_employees: {
          total_count: number;
          items: BuyableEmployee[];
          page_info: { current_page: number; total_pages: number };
        };
      }>(BUYABLE_EMPLOYEES, { page }, token);
      const result = data.css_company_buyable_employees;
      if (!result || !Array.isArray(result.items)) {
        throw new Error("Magento's Employee purchase scope is unavailable.");
      }
      validatePage(result.page_info, page, result.items.length);
      for (const employee of result.items) {
        if (!Number.isSafeInteger(employee.employee_id) || employee.employee_id < 1
          || typeof employee.full_name !== "string" || !employee.full_name.trim()
          || seen.has(employee.employee_id)) {
          throw new Error("Magento returned invalid or duplicate Employee membership.");
        }
        seen.add(employee.employee_id);
        // Do not invent manager/company/role fields in a purchase-only
        // response. A separate effective-role check is needed at selection.
        employees.push({ ...employee, company_id: null, purchase_control_role_id: null });
      }
      if (page >= result.page_info.total_pages) {
        if (result.total_count !== employees.length) {
          throw new Error("Magento returned an incomplete Employee purchase scope.");
        }
        return employees;
      }
    } else {
      const data = await magentoGraphQL<{
        css_company_employees: {
          items: Array<StoreEmployee & { active: boolean }>;
          page_info: { current_page: number; total_pages: number };
        };
      }>(ACTIVE_EMPLOYEES, { page }, token);
      const result = data.css_company_employees;
      if (!result || !Array.isArray(result.items)) {
        throw new Error("Magento's Employee directory is unavailable.");
      }
      validatePage(result.page_info, page, result.items.length);
      for (const employee of result.items.filter((item) => item.active)) {
        if (!Number.isSafeInteger(employee.employee_id) || employee.employee_id < 1
          || seen.has(employee.employee_id)) {
          throw new Error("Magento returned invalid or duplicate Employee membership.");
        }
        seen.add(employee.employee_id);
        employees.push(employee);
      }
      if (page >= result.page_info.total_pages) return employees;
    }
  }
  throw new Error("The Employee list is too large or its pagination changed. Contact your account administrator.");
}

export async function getEmployeeOrdering(token: string): Promise<EmployeeOrdering> {
  const configuration = await magentoGraphQL<{
    css_company_employee_configuration: {
      uses_employee: boolean;
      multi_employee_basket: boolean;
    };
  }>(EMPLOYEE_CONFIGURATION, {}, token);

  const config = configuration.css_company_employee_configuration;
  if (!config.uses_employee) {
    return { usesEmployee: false, multiEmployeeBasket: config.multi_employee_basket, employees: [] };
  }

  return {
    usesEmployee: true,
    multiEmployeeBasket: config.multi_employee_basket,
    employees: await getActiveEmployees(token),
  };
}
