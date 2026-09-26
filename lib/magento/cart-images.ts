import { magentoGraphQL } from "@/lib/magento/client";

export type BasketProductImage = {
  url: string;
  label: string | null;
};

type GroupedParent = {
  __typename: string;
  sku: string;
  small_image: BasketProductImage | null;
  items?: Array<{
    product: {
      sku: string;
      variants?: Array<{ product: { sku: string } }> | null;
    };
  }> | null;
};

const GROUPED_PARENT_IMAGES = /* GraphQL */ `
  query StoreGroupedParentImages($page: Int!, $pageSize: Int!) {
    products(
      filter: { price: { to: "999999999" } }
      currentPage: $page
      pageSize: $pageSize
      sort: { name: ASC }
    ) {
      page_info { current_page total_pages }
      items {
        __typename
        sku
        small_image { url label }
        ... on GroupedProduct {
          items {
            product { sku }
          }
        }
        ... on CssGroupedConfigurableProduct {
          items {
            product {
              sku
              ... on ConfigurableProduct {
                variants {
                  product { sku }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function usableImage(image: BasketProductImage | null | undefined) {
  const url = image?.url?.trim();
  if (!url) return false;
  return !/\/placeholder(?:\/|_|\.)/i.test(url);
}

export type BasketParentPresentation = {
  parent_sku: string;
  image: BasketProductImage;
};

export async function getGroupedParentPresentationMap(
  token: string,
): Promise<Map<string, BasketParentPresentation>> {
  const presentations = new Map<string, BasketParentPresentation>();
  const pageSize = 48;
  let page = 1;
  let totalPages = 1;

  try {
    do {
      const data = await magentoGraphQL<{
        products: {
          page_info: { current_page: number; total_pages: number };
          items: GroupedParent[];
        };
      }>(GROUPED_PARENT_IMAGES, { page, pageSize }, token);

      totalPages = Math.max(1, data.products.page_info.total_pages || 1);

      for (const parent of data.products.items || []) {
        if (!usableImage(parent.small_image)) continue;
        if (parent.__typename !== "GroupedProduct" && parent.__typename !== "CssGroupedConfigurableProduct") continue;

        for (const item of parent.items || []) {
          const presentation = {
            parent_sku: parent.sku,
            image: parent.small_image as BasketProductImage,
          };
          presentations.set(item.product.sku, presentation);

          for (const variant of item.product.variants || []) {
            presentations.set(variant.product.sku, presentation);
          }
        }
      }

      page += 1;
    } while (page <= totalPages);
  } catch {
    // Basket imagery is optional enrichment. Never block the basket if Magento
    // cannot resolve grouped-parent media on a particular installation.
    return new Map();
  }

  return presentations;
}

export function basketImageNeedsFallback(
  image: BasketProductImage | null | undefined,
) {
  return !usableImage(image);
}
