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

const GROUPED_PARENT_CANDIDATES = /* GraphQL */ `
  query StoreGroupedParentCandidates($filter: ProductAttributeFilterInput!, $pageSize: Int!) {
    products(
      filter: $filter
      currentPage: 1
      pageSize: $pageSize
    ) {
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

function parentSkuCandidates(childSku: string) {
  const parts = childSku.split("/").map((part) => part.trim()).filter(Boolean);
  const candidates = new Set<string>();

  // Most CSS grouped SKUs append a size/variant segment to the grouped parent.
  for (let end = parts.length - 1; end >= 2; end -= 1) {
    candidates.add(parts.slice(0, end).join("/"));
  }

  // Some legacy SKUs insert the size before a trailing style/length segment,
  // e.g. CEME/MV91/HO/S/2T -> CEME/MV91/HO/2T.
  for (let index = 2; index < parts.length; index += 1) {
    const candidate = parts.filter((_, partIndex) => partIndex !== index).join("/");
    if (candidate && candidate !== childSku) candidates.add(candidate);
  }

  return [...candidates];
}

function parentContainsSku(parent: GroupedParent, childSku: string) {
  return (parent.items || []).some((item) =>
    item.product.sku === childSku
    || (item.product.variants || []).some((variant) => variant.product.sku === childSku),
  );
}

export type BasketParentPresentation = {
  parent_sku: string;
  image: BasketProductImage;
};

export async function getGroupedParentPresentationMap(
  token: string,
  childSkus: string[],
): Promise<Map<string, BasketParentPresentation>> {
  const requestedSkus = Array.from(new Set(childSkus.map((sku) => sku.trim()).filter(Boolean)));
  if (!requestedSkus.length) return new Map();

  const candidateSkus = Array.from(new Set(requestedSkus.flatMap(parentSkuCandidates)));
  if (!candidateSkus.length) return new Map();

  try {
    const data = await magentoGraphQL<{
      products: { items: GroupedParent[] };
    }>(
      GROUPED_PARENT_CANDIDATES,
      {
        filter: { sku: { in: candidateSkus } },
        pageSize: Math.min(48, Math.max(1, candidateSkus.length)),
      },
      token,
    );

    const parents = (data.products.items || []).filter((parent) =>
      usableImage(parent.small_image)
      && (parent.__typename === "GroupedProduct" || parent.__typename === "CssGroupedConfigurableProduct"),
    );

    const presentations = new Map<string, BasketParentPresentation>();

    for (const childSku of requestedSkus) {
      const parent = parents.find((candidate) => parentContainsSku(candidate, childSku));
      if (!parent?.small_image) continue;

      presentations.set(childSku, {
        parent_sku: parent.sku,
        image: parent.small_image,
      });
    }

    return presentations;
  } catch {
    // Basket imagery is optional enrichment. Never block the basket if Magento
    // cannot resolve grouped-parent media on a particular installation.
    return new Map();
  }
}

export function basketImageNeedsFallback(
  image: BasketProductImage | null | undefined,
) {
  return !usableImage(image);
}
