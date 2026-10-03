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
): Promise<CataloguePageContext> {
  const cleanSearch = search.trim();
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.min(48, Math.trunc(pageSize)));

  const query = cleanSearch ? CATALOGUE_SEARCH : CATALOGUE_BROWSE;
  const variables = cleanSearch
    ? {
        search: cleanSearch,
        page: safePage,
        pageSize: safePageSize,
      }
    : {
        // Magento 2.4.7-p10 with the Fluid catalogue filter can return an empty
        // result for price { from: "0" }. Preserve the known-safe broad browse.
        filter: { price: { to: "999999999" } },
        page: safePage,
        pageSize: safePageSize,
      };

  const data = await magentoGraphQL<CataloguePageQuery>(
    query,
    variables,
    token,
  );

  const selectedCompany = data.css_company_context.companies.find((company) => company.selected) || null;
  const hidePrice = data.css_storefront_policy.hide_price;
  const prices = hidePrice
    ? new Map()
    : await getResilientCataloguePrices(
        token,
        data.products.items.map((product) => product.sku),
      );

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
        price_range: hidePrice ? null : prices.get(product.sku) ?? null,
      })),
    },
  };
}
