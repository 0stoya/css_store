import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";
import type { ProductBadgeValues } from "@/lib/product-badges";

type ProductBadgeRow = ProductBadgeValues & {
  sku: string;
};

const PRODUCT_BADGE_FIELDS = /* GraphQL */ `
        sku
        ppe_certified
        express_delivery
        fast_delivery
        made_to_order
        company_logo
        embroidered
        printed
`;

const PRODUCT_BADGES = /* GraphQL */ `
  query StoreProductBadgeValues($filter: ProductAttributeFilterInput!, $pageSize: Int!) {
    products(filter: $filter, currentPage: 1, pageSize: $pageSize) {
      items {
        ${PRODUCT_BADGE_FIELDS}
        always_in_stock
      }
    }
  }
`;

// New Magento EAV attributes can exist before their GraphQL fields are exposed.
// In that case preserve the established badges until Magento catches up.
const LEGACY_PRODUCT_BADGES = /* GraphQL */ `
  query StoreProductBadgeValuesLegacy($filter: ProductAttributeFilterInput!, $pageSize: Int!) {
    products(filter: $filter, currentPage: 1, pageSize: $pageSize) {
      items {
        ${PRODUCT_BADGE_FIELDS}
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
    const variables = {
      filter: { sku: { in: uniqueSkus } },
      pageSize: Math.max(1, uniqueSkus.length),
    };
    let data: { products: { items: ProductBadgeRow[] } };

    try {
      data = await magentoGraphQL<typeof data>(PRODUCT_BADGES, variables, token);
    } catch (error) {
      if (!(error instanceof MagentoGraphQLError)
        || !/Cannot query field ["']?always_in_stock["']?/i.test(error.message)) {
        throw error;
      }
      data = await magentoGraphQL<typeof data>(LEGACY_PRODUCT_BADGES, variables, token);
    }

    return new Map(
      (data.products.items || [])
        .filter((item) => Boolean(item?.sku))
        .map((item) => [
          item.sku,
          {
            ppe_certified: item.ppe_certified,
            express_delivery: item.express_delivery,
            fast_delivery: item.fast_delivery,
            always_in_stock: item.always_in_stock,
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
