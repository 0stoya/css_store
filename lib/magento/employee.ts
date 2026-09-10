import { magentoGraphQL } from "@/lib/magento/client";

export type StoreEmployee = {
  employee_id: number;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  department: string | null;
  cost_centre: string | null;
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

const ACTIVE_EMPLOYEES = /* GraphQL */ `
  query StoreActiveEmployees {
    css_company_employees(currentPage: 1, pageSize: 250, active: true) {
      items {
        employee_id
        employee_code
        first_name
        last_name
        full_name
        department
        cost_centre
        active
      }
    }
  }
`;

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

  const data = await magentoGraphQL<{
    css_company_employees: { items: Array<StoreEmployee & { active: boolean }> };
  }>(ACTIVE_EMPLOYEES, {}, token);

  return {
    usesEmployee: true,
    multiEmployeeBasket: config.multi_employee_basket,
    employees: data.css_company_employees.items.filter((employee) => employee.active),
  };
}
