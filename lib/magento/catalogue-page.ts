import { magentoGraphQL } from "@/lib/magento/client";
import { getResilientCataloguePrices } from "@/lib/magento/catalogue-prices";
import type { ProductCardProduct } from "@/components/product-card";

type CatalogueBaseProduct = Omit<ProductCardProduct, "price_range">;

type CataloguePageQuery = {
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
  };
  products: {
    total_count: number;
    page_info: { current_page: number; total_pages: number };
    items: CatalogueBaseProduct[];
  };
};

const PRODUCT_SELECTION = /* GraphQL */ `
  total_count
  page_info { current_page total_pages }
  items {
    uid
    sku
    name
    stock_status
    small_image { url label }
    css_purchase_allowance {
      logical_product_id
      has_active_restriction
      allowed_quantity
      purchased_quantity
      remaining_quantity
    }
    css_stock_info {
      available
      stock_status
      delivery_message
    }
  }
`;

const CATALOGUE_BROWSE = /* GraphQL */ `
  query StoreCataloguePageBrowse(
    $filter: ProductAttributeFilterInput!
    $page: Int!
    $pageSize: Int!
  ) {
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
    }
    products(
      filter: $filter
      currentPage: $page
      pageSize: $pageSize
      sort: { name: ASC }
    ) {
      ${PRODUCT_SELECTION}
    }
  }
`;

const CATALOGUE_SEARCH = /* GraphQL */ `
  query StoreCataloguePageSearch(
    $search: String!
    $page: Int!
    $pageSize: Int!
  ) {
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
    }
    products(
      search: $search
      currentPage: $page
      pageSize: $pageSize
    ) {
      ${PRODUCT_SELECTION}
    }
  }
`;

// Keep both established standard queries byte-for-byte. Only a qualified
// Employee shopping session adds the exact Magento SKU filter BEFORE paging.
const CATALOGUE_EMPLOYEE_SEARCH = CATALOGUE_SEARCH
  .replace("query StoreCataloguePageSearch(", "query StoreEmployeeCataloguePageSearch(")
  .replace("    $pageSize: Int!\n", "    $pageSize: Int!\n    $filter: ProductAttributeFilterInput!\n")
  .replace("    products(\n      search: $search", "    products(\n      filter: $filter\n      search: $search");

const EMPLOYEE_EMPTY_IDENTITY = /* GraphQL */ `
  query StoreEmployeeCatalogueEmpty {
    customer { firstname lastname }
    css_company_context { companies { company_id name selected } }
    css_storefront_policy { hide_price }
  }
`;

export type CataloguePageContext = {
  customerName: string;
  selectedCompany: {
    company_id: number;
    name: string | null;
  } | null;
  hidePrice: boolean;
  products: {
    total_count: number;
    page_info: { current_page: number; total_pages: number };
    items: ProductCardProduct[];
  };
};

export async function getCataloguePageContext(
  token: string,
  search = "",
  page = 1,
  pageSize = 24,
  allowedSkus: string[] | null = null,
  employeeCatalogueActive = false,
): Promise<CataloguePageContext> {
  const cleanSearch = search.trim();
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.min(48, Math.trunc(pageSize)));

  if (allowedSkus !== null && (allowedSkus.length > 10000
    || allowedSkus.some((sku) => typeof sku !== "string" || sku.length < 1))) {
    throw new Error("Employee catalogue membership is invalid.");
  }
  if (allowedSkus !== null && allowedSkus.length === 0) {
    // Never send sku: { in: [] }: some Magento filters interpret an empty
    // list as NO restriction. Identity read only; genuine zero products.
    const identity = await magentoGraphQL<Omit<CataloguePageQuery, "products">>(
      EMPLOYEE_EMPTY_IDENTITY, {}, token);
    const selected = identity.css_company_context.companies.find((company) => company.selected) || null;
    return {
      customerName: `${identity.customer.firstname} ${identity.customer.lastname}`.trim(),
      selectedCompany: selected ? { company_id: selected.company_id, name: selected.name } : null,
      hidePrice: identity.css_storefront_policy.hide_price,
      products: { total_count: 0, page_info: { current_page: 1, total_pages: 0 }, items: [] },
    };
  }

  const employee = allowedSkus !== null;
  const query = cleanSearch
    ? employee ? CATALOGUE_EMPLOYEE_SEARCH : CATALOGUE_SEARCH
    : CATALOGUE_BROWSE;
  const variables = cleanSearch
    ? {
        search: cleanSearch,
        ...(employee ? { filter: { sku: { in: allowedSkus } } } : {}),
        page: safePage,
        pageSize: safePageSize,
      }
    : {
        // Magento 2.4.7-p10 broad browse semantics are retained.
        filter: {
          price: { to: "999999999" },
          ...(employee ? { sku: { in: allowedSkus } } : {}),
        },
        page: safePage,
        pageSize: safePageSize,
      };

  const data = await magentoGraphQL<CataloguePageQuery>(query, variables, token);
  if (allowedSkus !== null && data.products.items.some((item) => !allowedSkus.includes(item.sku))) {
    throw new Error("Magento returned a product outside the Employee catalogue.");
  }

  const selectedCompany = data.css_company_context.companies.find((company) => company.selected) || null;
  const hidePrice = data.css_storefront_policy.hide_price;
  const prices = hidePrice
    ? null
    : await getResilientCataloguePrices(token, data.products.items.map((product) => product.sku));

  return {
    customerName: `${data.customer.firstname} ${data.customer.lastname}`.trim(),
    selectedCompany: selectedCompany
      ? {
          company_id: selectedCompany.company_id,
          name: selectedCompany.name,
        }
      : null,
    hidePrice,
    products: {
      ...data.products,
      items: data.products.items.map((product) => ({
        ...product,
        // This GraphQL allowance belongs to the logged-in buyer, not the
        // selected Employee. Employee Purchase Controls are checked by
        // Magento against actual cart attribution separately.
        css_purchase_allowance: employeeCatalogueActive || allowedSkus !== null
          ? null : product.css_purchase_allowance,
        // Unknown or failed item prices are never represented as £0.00.
        price_range: prices?.get(product.sku) ?? null,
      })),
    },
  };
}
