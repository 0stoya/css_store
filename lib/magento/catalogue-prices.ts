import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";

export type CataloguePriceRange = {
  minimum_price: {
    regular_price: { value: number; currency: string };
    final_price: { value: number; currency: string };
  };
} | null;

type CataloguePriceRow = {
  sku: string;
  price_range: CataloguePriceRange;
};

const CATALOGUE_PRICES = /* GraphQL */ `
  query StoreCataloguePrices($filter: ProductAttributeFilterInput!, $pageSize: Int!) {
    products(filter: $filter, currentPage: 1, pageSize: $pageSize) {
      items {
        sku
        price_range {
          minimum_price {
            regular_price { value currency }
            final_price { value currency }
          }
        }
      }
    }
  }
`;

async function fetchPriceBatch(
  token: string,
  skus: string[],
): Promise<Map<string, CataloguePriceRange>> {
  if (!skus.length) return new Map();

  try {
    const data = await magentoGraphQL<{
      products: { items: CataloguePriceRow[] };
    }>(
      CATALOGUE_PRICES,
      {
        filter: { sku: { in: skus } },
        pageSize: Math.max(1, skus.length),
      },
      token,
    );

    return new Map(
      (data.products.items || [])
        .filter((item) => Boolean(item?.sku))
        .map((item) => [item.sku, item.price_range] as const),
    );
  } catch (error) {
    if (!(error instanceof MagentoGraphQLError)) throw error;

    if (skus.length === 1) {
      console.warn(
        `[catalogue:price] skipping ${skus[0]} after Magento price_range failure: ${error.message}`,
      );
      return new Map([[skus[0], null]]);
    }

    const middle = Math.ceil(skus.length / 2);
    const [left, right] = await Promise.all([
      fetchPriceBatch(token, skus.slice(0, middle)),
      fetchPriceBatch(token, skus.slice(middle)),
    ]);

    return new Map([...left, ...right]);
  }
}

export function getResilientCataloguePrices(token: string, skus: string[]) {
  const uniqueSkus = Array.from(new Set(skus.map((sku) => sku.trim()).filter(Boolean)));
  return fetchPriceBatch(token, uniqueSkus);
}
