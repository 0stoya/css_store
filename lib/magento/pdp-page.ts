import { magentoGraphQL } from "@/lib/magento/client";
import { getActiveEmployees, type EmployeeOrdering } from "@/lib/magento/employee";
import type { ProductConfiguration } from "@/lib/magento/product";

type PdpPageQuery = {
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
  css_storefront_policy: {
    hide_price: boolean;
    hide_add_to_cart: boolean;
    add_to_cart_label: string | null;
  };
  css_company_employee_configuration: {
    uses_employee: boolean;
    multi_employee_basket: boolean;
  };
  css_repeat_order_lists: Array<{
    list_id: number;
    name: string;
  }>;
  products: {
    items: ProductConfiguration[];
  };
};

const CONFIGURABLE_CONFIGURATION_FIELDS = /* GraphQL */ `
  configurable_options {
    uid
    attribute_code
    label
    values { uid label }
  }
  variants {
    attributes { uid code label value_index }
    product { sku name stock_status }
  }
`;

const GROUPED_CHILD_FIELDS = /* GraphQL */ `
  __typename
  uid
  sku
  name
  stock_status
  price_range {
    minimum_price {
      regular_price { value currency }
      final_price { value currency }
    }
  }
  css_purchase_allowance {
    logical_product_id
    has_active_restriction
    allowed_quantity
    purchased_quantity
    remaining_quantity
  }
  css_stock_info { available stock_status delivery_message }
  css_purchase_constraints {
    minimum_quantity
    maximum_quantity
    quantity_increment
    increments_enforced
  }
  ... on ConfigurableProduct {
    ${CONFIGURABLE_CONFIGURATION_FIELDS}
  }
`;

const PDP_PAGE = /* GraphQL */ `
  query StorePdpPage($sku: String!) {
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
    css_storefront_policy {
      hide_price
      hide_add_to_cart
      add_to_cart_label
    }
    css_company_employee_configuration {
      uses_employee
      multi_employee_basket
    }
    css_repeat_order_lists {
      list_id
      name
    }
    products(
      filter: { sku: { eq: $sku } }
      pageSize: 1
      currentPage: 1
    ) {
      items {
        __typename
        sku
        name
        description { html }
        media_gallery { url label position }
        price_range {
          minimum_price {
            regular_price { value currency }
            final_price { value currency }
          }
        }
        css_purchase_allowance {
          logical_product_id
          has_active_restriction
          allowed_quantity
          purchased_quantity
          remaining_quantity
        }
        css_stock_info { available stock_status delivery_message }
        css_purchase_constraints {
          minimum_quantity
          maximum_quantity
          quantity_increment
          increments_enforced
        }
        ... on ConfigurableProduct {
          ${CONFIGURABLE_CONFIGURATION_FIELDS}
        }
        ... on CssGroupedConfigurableProduct {
          items {
            qty
            position
            product {
              ${GROUPED_CHILD_FIELDS}
            }
          }
        }
        ... on GroupedProduct {
          items {
            qty
            position
            product {
              ${GROUPED_CHILD_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export type PdpPageContext = {
  customerName: string;
  selectedCompany: {
    company_id: number;
    name: string | null;
  } | null;
  storefrontPolicy: {
    hidePrice: boolean;
    hideAddToCart: boolean;
    addToCartLabel: string | null;
  };
  employeeOrdering: EmployeeOrdering;
  repeatLists: Array<{
    list_id: number;
    name: string;
  }>;
  product: ProductConfiguration | null;
};

export async function getPdpPageContext(
  token: string,
  sku: string,
): Promise<PdpPageContext> {
  const data = await magentoGraphQL<PdpPageQuery>(
    PDP_PAGE,
    { sku },
    token,
  );

  const configuration = data.css_company_employee_configuration;
  const employees = configuration.uses_employee && configuration.multi_employee_basket
    ? await getActiveEmployees(token)
    : [];

  const selectedCompany = data.css_company_context.companies.find((company) => company.selected) || null;
  const product = data.products.items.find((item) => item?.sku === sku) || null;

  return {
    customerName: `${data.customer.firstname} ${data.customer.lastname}`.trim(),
    selectedCompany: selectedCompany
      ? {
          company_id: selectedCompany.company_id,
          name: selectedCompany.name,
        }
      : null,
    storefrontPolicy: {
      hidePrice: data.css_storefront_policy.hide_price,
      hideAddToCart: data.css_storefront_policy.hide_add_to_cart,
      addToCartLabel: data.css_storefront_policy.add_to_cart_label,
    },
    employeeOrdering: {
      usesEmployee: configuration.uses_employee,
      multiEmployeeBasket: configuration.multi_employee_basket,
      employees,
    },
    repeatLists: data.css_repeat_order_lists,
    product,
  };
}
