import { magentoGraphQL } from "@/lib/magento/client";

export type MenuCategory = {
  uid: string;
  name: string;
  url_key: string | null;
  position: number;
  product_count: number;
  children: MenuCategory[];
};

type MagentoCategoryNode = {
  uid: string;
  name: string;
  url_key: string | null;
  position: number | null;
  include_in_menu: number | null;
  children: MagentoCategoryNode[] | null;
};

type CustomerCatalogueCategoryPage = {
  products: {
    page_info: {
      current_page: number;
      total_pages: number;
    };
    items: Array<{
      categories: Array<{ uid: string }> | null;
    } | null>;
  };
};

type RawMenuCacheEntry = {
  expiresAt: number;
  promise: Promise<MagentoCategoryNode[]>;
};

declare global {
  // The category tree is store-scoped presentation metadata. Customer-specific
  // entitlement remains live in getCustomerCategoryProductCounts().
  var __cssStoreRawMenuCategories: RawMenuCacheEntry | undefined;
}

const STORE_ROOT = /* GraphQL */ `
  query StoreMenuRootCategoryId {
    storeConfig { root_category_id }
  }
`;

const MENU_CATEGORIES = /* GraphQL */ `
  query StoreMenuCategories($rootId: String!) {
    categories(filters: { ids: { eq: $rootId } }, pageSize: 1, currentPage: 1) {
      items {
        children {
          uid
          name
          url_key
          position
          include_in_menu
          children {
            uid
            name
            url_key
            position
            include_in_menu
            children {
              uid
              name
              url_key
              position
              include_in_menu
            }
          }
        }
      }
    }
  }
`;

const CUSTOMER_CATALOGUE_CATEGORIES = /* GraphQL */ `
  query CustomerCatalogueCategories($filter: ProductAttributeFilterInput!, $page: Int!, $pageSize: Int!) {
    products(
      filter: $filter
      currentPage: $page
      pageSize: $pageSize
      sort: { name: ASC }
    ) {
      page_info { current_page total_pages }
      items {
        categories { uid }
      }
    }
  }
`;

const CUSTOMER_CATALOGUE_PAGE_SIZE = 100;
const RAW_MENU_TTL_MS = 5 * 60 * 1000;

function menuEnabled(value: number | null | undefined) {
  return value === 1;
}

function sortCategories(categories: MenuCategory[]) {
  return categories.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

async function loadRawMenuCategories(token: string) {
  const now = Date.now();
  const existing = globalThis.__cssStoreRawMenuCategories;
  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = (async () => {
    const root = await magentoGraphQL<{ storeConfig: { root_category_id: number | null } }>(
      STORE_ROOT,
      {},
      token,
    );
    if (!root.storeConfig.root_category_id) return [];

    const data = await magentoGraphQL<{
      categories: { items: Array<{ children: MagentoCategoryNode[] | null }> };
    }>(
      MENU_CATEGORIES,
      { rootId: String(root.storeConfig.root_category_id) },
      token,
    );

    return (data.categories.items[0]?.children || [])
      .filter((category) => Boolean(category?.uid && category?.name) && menuEnabled(category.include_in_menu));
  })();

  globalThis.__cssStoreRawMenuCategories = {
    expiresAt: now + RAW_MENU_TTL_MS,
    promise,
  };

  try {
    return await promise;
  } catch (error) {
    if (globalThis.__cssStoreRawMenuCategories?.promise === promise) {
      globalThis.__cssStoreRawMenuCategories = undefined;
    }
    throw error;
  }
}

async function getCustomerCategoryProductCounts(token: string) {
  const counts = new Map<string, number>();
  let currentPage = 1;
  let totalPages = 1;

  do {
    const data = await magentoGraphQL<CustomerCatalogueCategoryPage>(
      CUSTOMER_CATALOGUE_CATEGORIES,
      {
        // Match the storefront's broad authenticated browse. Magento 2.4.7-p10
        // can return an empty result for price { from: "0" } in this setup.
        filter: { price: { to: "999999999" } },
        page: currentPage,
        pageSize: CUSTOMER_CATALOGUE_PAGE_SIZE,
      },
      token,
    );

    totalPages = Math.max(1, data.products.page_info.total_pages || 1);

    for (const item of data.products.items || []) {
      if (!item) continue;

      // A product can expose its leaf and ancestor categories. Count each UID
      // at most once per product so menu counts remain customer-product counts.
      const seen = new Set<string>();
      for (const category of item.categories || []) {
        const uid = category?.uid?.trim();
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        counts.set(uid, (counts.get(uid) || 0) + 1);
      }
    }

    currentPage += 1;
  } while (currentPage <= totalPages);

  return counts;
}

function mapCategory(
  node: MagentoCategoryNode,
  productCounts: Map<string, number>,
): MenuCategory | null {
  const children = sortCategories(
    (node.children || [])
      .filter((child) => Boolean(child?.uid && child?.name) && menuEnabled(child.include_in_menu))
      .map((child) => mapCategory(child, productCounts))
      .filter((child): child is MenuCategory => child !== null),
  );

  const productCount = productCounts.get(node.uid) || 0;
  if (productCount <= 0 && children.length === 0) return null;

  return {
    uid: node.uid,
    name: node.name,
    url_key: node.url_key || null,
    position: node.position || 0,
    product_count: productCount,
    children,
  };
}

export async function getMenuCategories(token: string): Promise<MenuCategory[]> {
  // Cache only store-wide category metadata. Customer-specific visibility and
  // counts are deliberately recomputed from the authenticated product universe.
  const rawCategories = await loadRawMenuCategories(token);
  if (rawCategories.length === 0) return [];

  const productCounts = await getCustomerCategoryProductCounts(token);

  return sortCategories(
    rawCategories
      .map((category) => mapCategory(category, productCounts))
      .filter((category): category is MenuCategory => category !== null),
  );
}
