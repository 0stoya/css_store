import { getMagentoConfig } from "@/lib/config";
import { magentoGraphQL } from "@/lib/magento/client";

export type PurchaseAllowance = {
  logical_product_id: number;
  has_active_restriction: boolean;
  allowed_quantity: number;
  purchased_quantity: number;
  remaining_quantity: number;
};

export type PurchaseConstraints = {
  minimum_quantity: number;
  maximum_quantity: number | null;
  quantity_increment: number;
  increments_enforced: boolean;
};

export type StockInfo = {
  available: boolean;
  stock_status: string;
  delivery_message: string;
};

export type StoreCategory = {
  uid: string;
  name: string;
  url_key: string | null;
  image_url: string | null;
  position: number;
  product_count: number;
};

export type StoreProduct = {
  __typename: string;
  uid: string;
  sku: string;
  name: string;
  url_key: string | null;
  stock_status: string | null;
  small_image: { url: string; label: string | null } | null;
  price_range: {
    minimum_price: {
      regular_price: { value: number; currency: string };
      final_price: { value: number; currency: string };
    };
  } | null;
  css_purchase_allowance: PurchaseAllowance | null;
  css_stock_info: StockInfo;
  css_purchase_constraints: PurchaseConstraints | null;
};

export type StoreProductResult = {
  total_count: number;
  page_info: { current_page: number; total_pages: number };
  items: StoreProduct[];
};

const STORE_ROOT = /* GraphQL */ `
  query StoreRootCategoryId {
    storeConfig { root_category_id }
  }
`;

const ROOT_CATEGORIES = /* GraphQL */ `
  query StoreRootCategories($rootId: String!) {
    categories(filters: { ids: { eq: $rootId } }, pageSize: 1, currentPage: 1) {
      items {
        children {
          uid
          name
          url_key
          image
          position
          product_count
        }
      }
    }
  }
`;

const PRODUCT_SELECTION = /* GraphQL */ `
  total_count
  page_info { current_page total_pages }
  items {
    __typename
    uid
    sku
    name
    url_key
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
  }
`;

const BROWSE_PRODUCTS = /* GraphQL */ `
  query StoreProductsBrowse($filter: ProductAttributeFilterInput!, $page: Int!, $pageSize: Int!) {
    products(filter: $filter, currentPage: $page, pageSize: $pageSize, sort: { name: ASC }) {
      ${PRODUCT_SELECTION}
    }
  }
`;

const SEARCH_PRODUCTS = /* GraphQL */ `
  query StoreProductsSearch($search: String!, $page: Int!, $pageSize: Int!) {
    products(search: $search, currentPage: $page, pageSize: $pageSize) {
      ${PRODUCT_SELECTION}
    }
  }
`;

const FILTERED_SEARCH_PRODUCTS = /* GraphQL */ `
  query StoreProductsCategorySearch(
    $search: String!
    $filter: ProductAttributeFilterInput!
    $page: Int!
    $pageSize: Int!
  ) {
    products(search: $search, filter: $filter, currentPage: $page, pageSize: $pageSize) {
      ${PRODUCT_SELECTION}
    }
  }
`;

function categoryImageUrl(image: string | null | undefined) {
  const value = image?.trim();
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    const relative = value.replace(/^\/+/, "");
    const path = relative.startsWith("media/") ? `/${relative}` : `/media/catalog/category/${relative}`;
    return new URL(path, `${getMagentoConfig().baseUrl}/`).toString();
  }
}

export async function getCategories(token: string): Promise<StoreCategory[]> {
  const root = await magentoGraphQL<{ storeConfig: { root_category_id: number | null } }>(STORE_ROOT, {}, token);
  if (!root.storeConfig.root_category_id) return [];

  const data = await magentoGraphQL<{
    categories: {
      items: Array<{
        children: Array<{
          uid: string;
          name: string;
          url_key: string | null;
          image: string | null;
          position: number | null;
          product_count: number | null;
        }> | null;
      }>;
    };
  }>(ROOT_CATEGORIES, { rootId: String(root.storeConfig.root_category_id) }, token);

  return (data.categories.items[0]?.children || [])
    .filter((item) => Boolean(item?.uid && item?.name))
    .map((item) => ({
      uid: item.uid,
      name: item.name,
      url_key: item.url_key || null,
      image_url: categoryImageUrl(item.image),
      position: item.position || 0,
      product_count: item.product_count || 0,
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export async function getProducts(
  token: string,
  search = "",
  page = 1,
  pageSize = 24,
  categoryUid = "",
): Promise<StoreProductResult> {
  const cleanSearch = search.trim();
  const cleanCategory = categoryUid.trim();
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.min(48, Math.trunc(pageSize)));

  let query = BROWSE_PRODUCTS;
  let variables: Record<string, unknown> = {
    filter: cleanCategory ? { category_uid: { eq: cleanCategory } } : { price: { from: "0" } },
    page: safePage,
    pageSize: safePageSize,
  };

  if (cleanSearch && cleanCategory) {
    query = FILTERED_SEARCH_PRODUCTS;
    variables = {
      search: cleanSearch,
      filter: { category_uid: { eq: cleanCategory } },
      page: safePage,
      pageSize: safePageSize,
    };
  } else if (cleanSearch) {
    query = SEARCH_PRODUCTS;
    variables = { search: cleanSearch, page: safePage, pageSize: safePageSize };
  }

  const data = await magentoGraphQL<{ products: StoreProductResult }>(query, variables, token);
  return data.products;
}
