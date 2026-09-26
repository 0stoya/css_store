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
  byUid: { items: CategoryRoute[] };
  byUrl: { items: CategoryRoute[] };
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

const CATEGORY_ROUTE = /* GraphQL */ `
  query StoreCategoryRoute($key: String!) {
    customer { firstname lastname }
    css_company_context {
      companies {
        company_id
        name
        selected
      }
    }
    css_storefront_policy { hide_price }
    byUid: categories(
      filters: { category_uid: { eq: $key } }
      pageSize: 1
      currentPage: 1
    ) {
      items { uid name url_key url_path }
    }
    byUrl: categories(
      filters: { url_key: { eq: $key } }
      pageSize: 1
      currentPage: 1
    ) {
      items { uid name url_key url_path }
    }
  }
`;

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
    CATEGORY_ROUTE,
    { key },
    token,
  );

  const category = route.byUid.items[0] || route.byUrl.items[0] || null;
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
