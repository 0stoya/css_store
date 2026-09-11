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
  product_count: number | null;
  include_in_menu: number | null;
  children: MagentoCategoryNode[] | null;
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
          product_count
          include_in_menu
          children {
            uid
            name
            url_key
            position
            product_count
            include_in_menu
            children {
              uid
              name
              url_key
              position
              product_count
              include_in_menu
            }
          }
        }
      }
    }
  }
`;

function menuEnabled(value: number | null | undefined) {
  return value === 1;
}

function sortCategories(categories: MenuCategory[]) {
  return categories.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

function mapCategory(node: MagentoCategoryNode): MenuCategory {
  return {
    uid: node.uid,
    name: node.name,
    url_key: node.url_key || null,
    position: node.position || 0,
    product_count: node.product_count || 0,
    children: sortCategories(
      (node.children || [])
        .filter((child) => Boolean(child?.uid && child?.name) && menuEnabled(child.include_in_menu))
        .map(mapCategory),
    ),
  };
}

export async function getMenuCategories(token: string): Promise<MenuCategory[]> {
  const root = await magentoGraphQL<{ storeConfig: { root_category_id: number | null } }>(STORE_ROOT, {}, token);
  if (!root.storeConfig.root_category_id) return [];

  const data = await magentoGraphQL<{
    categories: { items: Array<{ children: MagentoCategoryNode[] | null }> };
  }>(MENU_CATEGORIES, { rootId: String(root.storeConfig.root_category_id) }, token);

  return sortCategories(
    (data.categories.items[0]?.children || [])
      .filter((category) => Boolean(category?.uid && category?.name) && menuEnabled(category.include_in_menu))
      .map(mapCategory),
  );
}
