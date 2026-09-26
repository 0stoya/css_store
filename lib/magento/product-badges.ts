import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";
import type { ProductBadgeValues } from "@/lib/product-badges";

type ProductBadgeRow = ProductBadgeValues & {
  sku: string;
};

const PRODUCT_BADGES = /* GraphQL */ `
  query StoreProductBadgeValues($filter: ProductAttributeFilterInput!, $pageSize: Int!) {
    products(filter: $filter, currentPage: 1, pageSize: $pageSize) {
      items {
        sku
        ppe_certified
        express_delivery
        fast_delivery
        made_to_order
        company_logo
        embroidered
        printed
      }
    }
  }
`;

export async function getProductBadgeValues(
  token: string,
  skus: string[],
): Promise<Map<string, ProductBadgeValues>> {
  const uniqueSkus = Array.from(new Set(skus.map((sku) => sku.trim()).filter(Boolean)));
  if (!uniqueSkus.length) return new Map();

  try {
    const data = await magentoGraphQL<{
      products: { items: ProductBadgeRow[] };
    }>(
      PRODUCT_BADGES,
      {
        filter: { sku: { in: uniqueSkus } },
        pageSize: Math.max(1, uniqueSkus.length),
      },
      token,
    );

    return new Map(
      (data.products.items || [])
        .filter((item) => Boolean(item?.sku))
        .map((item) => [
          item.sku,
          {
            ppe_certified: item.ppe_certified,
            express_delivery: item.express_delivery,
            fast_delivery: item.fast_delivery,
            made_to_order: item.made_to_order,
            company_logo: item.company_logo,
            embroidered: item.embroidered,
            printed: item.printed,
          },
        ] as const),
    );
  } catch (error) {
    // Product icons are optional presentation metadata. A Magento EAV/GraphQL
    // compatibility failure must never take down the catalogue or PDP.
    if (error instanceof MagentoGraphQLError) return new Map();
    throw error;
  }
}
