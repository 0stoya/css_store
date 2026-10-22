import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";
import { getActiveEmployees, type EmployeeOrdering } from "@/lib/magento/employee";
import { getRepeatOrderLists } from "@/lib/magento/repeat-orders";
import type { ProductConfiguration } from "@/lib/magento/product";
import { PRODUCT_SPECIFICATION_CODES, type ProductSpecificationValues } from "@/lib/product-specifications";

type PdpProduct = Omit<ProductConfiguration, "uid" | "url_key" | "stock_status"> & ProductSpecificationValues;

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
  products: {
    items: PdpProduct[];
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
  small_image { url label }
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

// Request only parent SKU attributes: no variant or grouped-child fanout.
const PDP_SPECIFICATION_SELECTION = PRODUCT_SPECIFICATION_CODES.join("\n        ");

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
        ${PDP_SPECIFICATION_SELECTION}
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

// If a Magento deployment lacks an optional EAV GraphQL field, the PDP must
// remain orderable. Keep the old query as a strictly scoped fallback.
const PDP_PAGE_WITHOUT_SPECIFICATIONS = PDP_PAGE.replace(PDP_SPECIFICATION_SELECTION, "");

const PDP_EMPLOYEE_ORDERING = /* GraphQL */ `
  query StorePdpEmployeeOrdering {
    css_company_employee_configuration {
      uses_employee
      multi_employee_basket
    }
  }
`;

function isEmployeeOrderingAuthorizationDenied(error: unknown) {
  return error instanceof MagentoGraphQLError && error.category === "graphql-authorization";
}

async function getPdpEmployeeOrdering(token: string): Promise<{
  ordering: EmployeeOrdering;
  accessDenied: boolean;
}> {
  try {
    const data = await magentoGraphQL<{
      css_company_employee_configuration: {
        uses_employee: boolean;
        multi_employee_basket: boolean;
      };
    }>(PDP_EMPLOYEE_ORDERING, {}, token);
    const configuration = data.css_company_employee_configuration;
    const employees = configuration.uses_employee && configuration.multi_employee_basket
      ? await getActiveEmployees(token)
      : [];
    return {
      ordering: {
        usesEmployee: configuration.uses_employee,
        multiEmployeeBasket: configuration.multi_employee_basket,
        employees,
      },
      accessDenied: false,
    };
  } catch (error) {
    // Product browsing must not require Employee-management visibility.
    // An unknown ordering mode must NEVER be interpreted as ordering disabled:
    // explicitly block basket controls until authoritative access is restored.
    if (!isEmployeeOrderingAuthorizationDenied(error)) throw error;
    return {
      ordering: { usesEmployee: false, multiEmployeeBasket: false, employees: [] },
      accessDenied: true,
    };
  }
}

function isMissingSpecificationField(error: unknown): boolean {
  if (!(error instanceof MagentoGraphQLError)) return false;
  const missing = error.message.match(/Cannot query field ["']?([a-z_][a-z_0-9]*)["']?/i)?.[1];
  return Boolean(missing && PRODUCT_SPECIFICATION_CODES.some((code) => code === missing));
}

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
  employeeOrderingBlocked: boolean;
  repeatLists: Array<{
    list_id: number;
    name: string;
  }>;
  product: PdpProduct | null;
};

export async function getPdpPageContext(
  token: string,
  sku: string,
): Promise<PdpPageContext> {
  let data: PdpPageQuery;
  try {
    data = await magentoGraphQL<PdpPageQuery>(PDP_PAGE, { sku }, token);
  } catch (error) {
    if (!isMissingSpecificationField(error)) throw error;
    // Only optional schema errors are retried; auth and other failures still
    // use the existing Magento GraphQL error/redirect handling.
    console.warn("[store:pdp] Optional specification field is missing in Magento GraphQL.");
    data = await magentoGraphQL<PdpPageQuery>(PDP_PAGE_WITHOUT_SPECIFICATIONS, { sku }, token);
  }

  const selectedCompany = data.css_company_context.companies.find((company) => company.selected) || null;
  const product = data.products.items.find((item) => item?.sku === sku) || null;

  const [employeeState, repeatListData] = await Promise.all([
    product
      ? getPdpEmployeeOrdering(token)
      : Promise.resolve({
          ordering: { usesEmployee: false, multiEmployeeBasket: false, employees: [] } as EmployeeOrdering,
          accessDenied: false,
        }),
    product?.__typename === "CssGroupedConfigurableProduct"
      ? getRepeatOrderLists(token)
      : Promise.resolve({ css_repeat_order_lists: [] }),
  ]);

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
    employeeOrdering: employeeState.ordering,
    employeeOrderingBlocked: employeeState.accessDenied,
    repeatLists: repeatListData.css_repeat_order_lists.map((list) => ({ list_id: list.list_id, name: list.name })),
    product,
  };
}
