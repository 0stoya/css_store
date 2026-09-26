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

type CategoryCountResult = {
  total_count: number | null;
};

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

const CATEGORY_COUNT_BATCH_SIZE = 30;

function menuEnabled(value: number | null | undefined) {
  return value === 1;
}

function sortCategories(categories: MenuCategory[]) {
  return categories.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

function collectMenuCategoryUids(nodes: MagentoCategoryNode[], result: string[] = []) {
  for (const node of nodes) {
    if (!node?.uid || !node.name || !menuEnabled(node.include_in_menu)) continue;
    result.push(node.uid);
    collectMenuCategoryUids(node.children || [], result);
  }
  return result;
}

async function getCategoryProductCounts(token: string, categoryUids: string[]) {
  const uniqueUids = Array.from(new Set(categoryUids));
  const batches: string[][] = [];

  for (let index = 0; index < uniqueUids.length; index += CATEGORY_COUNT_BATCH_SIZE) {
    batches.push(uniqueUids.slice(index, index + CATEGORY_COUNT_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const declarations = batch.map((_, index) => `$c${index}: String!`).join(", ");
      const selections = batch.map((_, index) => `
        c${index}: products(
          filter: { category_uid: { eq: $c${index} } }
          pageSize: 1
          currentPage: 1
        ) {
          total_count
        }
      `).join("\n");

      const query = `
        query CustomerMenuCategoryProductCounts(${declarations}) {
          ${selections}
        }
      `;

      const variables = Object.fromEntries(
        batch.map((uid, index) => [`c${index}`, uid]),
      );

      const data = await magentoGraphQL<Record<string, CategoryCountResult | null>>(
        query,
        variables,
        token,
      );

      return batch.map((uid, index) => {
        const count = data[`c${index}`]?.total_count;
        return [uid, typeof count === "number" ? Math.max(0, count) : 0] as const;
      });
    }),
  );

  return new Map(results.flat());
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

  const rawCategories = (data.categories.items[0]?.children || [])
    .filter((category) => Boolean(category?.uid && category?.name) && menuEnabled(category.include_in_menu));

  const categoryUids = collectMenuCategoryUids(rawCategories);
  if (categoryUids.length === 0) return [];

  // Magento category product_count is store-wide. Verify each category through
  // the authenticated products resolver instead so company/role catalogue
  // restrictions remain authoritative for the navigation.
  const productCounts = await getCategoryProductCounts(token, categoryUids);

  return sortCategories(
    rawCategories
      .map((category) => mapCategory(category, productCounts))
      .filter((category): category is MenuCategory => category !== null),
  );
}
