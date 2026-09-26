import type { CartSnapshot } from "@/lib/magento/cart";
import { magentoGraphQL } from "@/lib/magento/client";
import { getActiveEmployees, type EmployeeOrdering } from "@/lib/magento/employee";

export type BasketPageCart = Pick<
  CartSnapshot,
  "id" | "total_quantity" | "itemsV2" | "prices" | "css_purchase_eligibility" | "css_company_discount"
>;

type BasketPageQuery = {
  customer: {
    firstname: string;
    lastname: string;
  };
  css_company_context: {
    companies: Array<{
      company_id: number;
      name: string | null;
      selected: boolean;
    }>;
  };
  css_company_employee_configuration: {
    uses_employee: boolean;
    multi_employee_basket: boolean;
  };
  customerCart: BasketPageCart;
};

const BASKET_PAGE = /* GraphQL */ `
  query StoreBasketPage {
    customer {
      firstname
      lastname
    }
    css_company_context {
      companies {
        company_id
        name
        selected
      }
    }
    css_company_employee_configuration {
      uses_employee
      multi_employee_basket
    }
    customerCart {
      id
      total_quantity
      itemsV2 {
        items {
          uid
          quantity
          product {
            allowance_product_id: id
            sku
            name
            stock_status
            small_image { url label }
            css_stock_info {
              available
              stock_status
              delivery_message
            }
            css_purchase_constraints {
              minimum_quantity
              maximum_quantity
              quantity_increment
              increments_enforced
            }
          }
          prices {
            price { value currency }
            row_total { value currency }
          }
          ... on ConfigurableCartItem {
            configured_variant { sku name }
            configurable_options { option_label value_label }
          }
          css_kit {
            employee_id
            employee_name
            employee_code
            parent_kit_product_id
          }
          css_employee {
            employee_id
            employee_name
            employee_code
          }
        }
      }
      prices {
        subtotal_excluding_tax { value currency }
        grand_total { value currency }
      }
      css_purchase_eligibility {
        approval_status
        items {
          logical_product_id
          has_active_restriction
          allowed_quantity
          purchased_quantity
          remaining_quantity
          requested_quantity
          status
          reason
        }
      }
      css_company_discount {
        applied
        label
        percent
        amount
        base_amount
        currency
        base_currency
      }
    }
  }
`;

export type BasketPageContext = {
  customerName: string;
  selectedCompany: {
    company_id: number;
    name: string | null;
  } | null;
  cart: BasketPageCart;
  ordering: EmployeeOrdering;
};

export async function getBasketPageContext(token: string): Promise<BasketPageContext> {
  const data = await magentoGraphQL<BasketPageQuery>(BASKET_PAGE, {}, token);
  const configuration = data.css_company_employee_configuration;

  const ordering: EmployeeOrdering = {
    usesEmployee: configuration.uses_employee,
    multiEmployeeBasket: configuration.multi_employee_basket,
    employees: configuration.uses_employee && configuration.multi_employee_basket
      ? await getActiveEmployees(token)
      : [],
  };

  const selectedCompany = data.css_company_context.companies.find((company) => company.selected) || null;

  return {
    customerName: `${data.customer.firstname} ${data.customer.lastname}`.trim(),
    selectedCompany: selectedCompany
      ? { company_id: selectedCompany.company_id, name: selectedCompany.name }
      : null,
    cart: data.customerCart,
    ordering,
  };
}
