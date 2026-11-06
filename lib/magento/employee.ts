import { magentoGraphQL } from "@/lib/magento/client";

export type StoreEmployee = {
  employee_id: number;
  company_id: number;
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

// Live Magento supports the manager-scoped Employee directory, not
// css_company_buyable_employees. Reuse the existing scoped contract.
const ACTIVE_EMPLOYEES = /* GraphQL */ `
  query StoreActiveEmployees($page: Int!) {
    css_company_employees(currentPage: $page, pageSize: 200, active: true) {
      items { employee_id company_id purchase_control_role_id employee_code full_name department active }
      page_info { current_page total_pages }
    }
  }
`;

export async function getActiveEmployees(token: string): Promise<StoreEmployee[]> {
  const employees: StoreEmployee[] = [];
  // Magento caps Employee pages at 200; never silently hide Employees beyond
  // the first page (the former Store request asked for 250 but got only 200).
  for (let page = 1; page <= 50; page += 1) {
    const data = await magentoGraphQL<{
      css_company_employees: {
        items: Array<StoreEmployee & { active: boolean }>;
        page_info: { current_page: number; total_pages: number };
      };
    }>(ACTIVE_EMPLOYEES, { page }, token);
    const result = data.css_company_employees;
    if (
      result.page_info.current_page !== page
      || result.page_info.total_pages > 50
      || result.page_info.total_pages < 0
      || (page > result.page_info.total_pages && result.page_info.total_pages !== 0)
    ) {
      throw new Error("The Employee list is too large or its pagination changed. Contact your account administrator.");
    }
    employees.push(...result.items.filter((employee) => employee.active));
    if (page >= result.page_info.total_pages) return employees;
  }
  throw new Error("The Employee list could not be loaded completely.");
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
