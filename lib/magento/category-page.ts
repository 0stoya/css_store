import type { ProductCardProduct } from "@/components/product-card";
import { magentoGraphQL } from "@/lib/magento/client";

type CategoryRoute = {
  uid: string;
  name: string;
  url_key: string | null;
  url_path: string | null;
};

type CategoryRouteQuery = {
  customer: { firstname: string; lastname: string };
  css_company_context: {
    companies: Array<{
      company_id: number;
      name: string | null;
      selected: boolean;
    }>;
  };
  css_storefront_policy: { hide_price: boolean };
  categories: { items: CategoryRoute[] };
};

type CategoryProductsQuery = {
  products: {
    total_count: number;
    page_info: { current_page: number; total_pages: number };
    items: ProductCardProduct[];
  };
};

const PRODUCT_CARD_SELECTION = /* GraphQL */ `
  total_count
  page_info { current_page total_pages }
  items {
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
    css_stock_info {
      available
      stock_status
      delivery_message
    }
  }
`;

const CATEGORY_ROUTE_FIELDS = /* GraphQL */ `
  customer { firstname lastname }
  css_company_context {
    companies {
      company_id
      name
      selected
    }
  }
  css_storefront_policy { hide_price }
`;

const CATEGORY_ROUTE_BY_URL = /* GraphQL */ `
  query StoreCategoryRouteByUrl($key: String!) {
    ${CATEGORY_ROUTE_FIELDS}
    categories(
      filters: { url_key: { eq: $key } }
      pageSize: 1
      currentPage: 1
    ) {
      items { uid name url_key url_path }
    }
  }
`;

const CATEGORY_ROUTE_BY_UID = /* GraphQL */ `
  query StoreCategoryRouteByUid($key: String!) {
    ${CATEGORY_ROUTE_FIELDS}
    categories(
      filters: { category_uid: { eq: $key } }
      pageSize: 1
      currentPage: 1
    ) {
      items { uid name url_key url_path }
    }
  }
`;

function isCategoryUid(value: string) {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (!/^\d+$/.test(decoded)) return false;

    return Buffer.from(decoded, "utf8")
      .toString("base64")
      .replace(/=+$/, "") === value.replace(/=+$/, "");
  } catch {
    return false;
  }
}

const CATEGORY_PRODUCTS = /* GraphQL */ `
  query StoreCategoryProducts(
    $categoryUid: String!
    $page: Int!
    $pageSize: Int!
  ) {
    products(
      filter: { category_uid: { eq: $categoryUid } }
      currentPage: $page
      pageSize: $pageSize
      sort: { name: ASC }
    ) {
      ${PRODUCT_CARD_SELECTION}
    }
  }
`;

export type CategoryPageContext = {
  customerName: string;
  selectedCompany: {
    company_id: number;
    name: string | null;
  } | null;
  hidePrice: boolean;
  category: CategoryRoute | null;
  products: CategoryProductsQuery["products"] | null;
};

export async function getCategoryPageContext(
  token: string,
  key: string,
  page = 1,
  pageSize = 24,
): Promise<CategoryPageContext> {
  const route = await magentoGraphQL<CategoryRouteQuery>(
    isCategoryUid(key) ? CATEGORY_ROUTE_BY_UID : CATEGORY_ROUTE_BY_URL,
    { key },
    token,
  );

  const category = route.categories.items[0] || null;
  const selectedCompany = route.css_company_context.companies.find((company) => company.selected) || null;

  if (!category) {
    return {
      customerName: `${route.customer.firstname} ${route.customer.lastname}`.trim(),
      selectedCompany: selectedCompany
        ? { company_id: selectedCompany.company_id, name: selectedCompany.name }
        : null,
      hidePrice: route.css_storefront_policy.hide_price,
      category: null,
      products: null,
    };
  }

  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.min(48, Math.trunc(pageSize)));
  const data = await magentoGraphQL<CategoryProductsQuery>(
    CATEGORY_PRODUCTS,
    {
      categoryUid: category.uid,
      page: safePage,
      pageSize: safePageSize,
    },
    token,
  );

  return {
    customerName: `${route.customer.firstname} ${route.customer.lastname}`.trim(),
    selectedCompany: selectedCompany
      ? { company_id: selectedCompany.company_id, name: selectedCompany.name }
      : null,
    hidePrice: route.css_storefront_policy.hide_price,
    category,
    products: data.products,
  };
}
