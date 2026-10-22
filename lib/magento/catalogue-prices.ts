import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";
import type { ProductCardProduct } from "@/components/product-card";

export type CataloguePriceRange = ProductCardProduct["price_range"];

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

// A broken Magento price resolver should not take down the whole catalogue.
// Only recover the specific production signature; never hide auth, permission,
// transport, schema or unexpected GraphQL failures.
function recoverablePriceResolverError(error: unknown): error is MagentoGraphQLError {
  return error instanceof MagentoGraphQLError
    && error.status === 200
    && !error.category
    && error.message.trim().toLowerCase() === "internal server error";
}

type PriceBatchResult = {
  prices: Map<string, CataloguePriceRange>;
  brokenSkus: string[];
};

// Cap fallback fan-out. A systemic Magento failure must not generate dozens of
// unlimited queries and then masquerade as an empty-price catalogue.
const MAX_PRICE_BATCH_REQUESTS = 32;
const MAX_CATALOGUE_CARD_SKUS = 48;

export async function getResilientCataloguePrices(
  token: string,
  sourceSkus: string[],
): Promise<Map<string, CataloguePriceRange>> {
  const skus = Array.from(new Set(sourceSkus.map((sku) => sku.trim()).filter(Boolean)));
  if (!skus.length) return new Map();
  if (skus.length > MAX_CATALOGUE_CARD_SKUS) {
    throw new Error("Catalogue price batch exceeds the supported page size.");
  }

  let attempts = 0;
  let originalPriceError: MagentoGraphQLError | null = null;

  async function readBatch(batch: string[]): Promise<PriceBatchResult> {
    if (++attempts > MAX_PRICE_BATCH_REQUESTS) {
      // Preserve the original Magento error for diagnostics and the safe Next
      // error boundary rather than inventing a successful price response.
      throw originalPriceError || new Error("Catalogue price lookup limit exceeded.");
    }

    try {
      const data = await magentoGraphQL<{
        products: { items: CataloguePriceRow[] };
      }>(
        CATALOGUE_PRICES,
        { filter: { sku: { in: batch } }, pageSize: batch.length },
        token,
      );

      const requested = new Set(batch);
      return {
        prices: new Map(
          (data.products.items || [])
            // Only enrich cards already returned by the company-scoped browse.
            .filter((item) => Boolean(item?.sku && requested.has(item.sku)))
            .map((item) => [item.sku, item.price_range] as const),
        ),
        brokenSkus: [],
      };
    } catch (error) {
      if (!recoverablePriceResolverError(error)) throw error;
      originalPriceError ||= error;

      if (batch.length === 1) {
        return {
          prices: new Map([[batch[0], null]]),
          brokenSkus: [batch[0]],
        };
      }

      const midpoint = Math.ceil(batch.length / 2);
      // Sequential bounded fallback avoids a burst of concurrent Magento
      // queries when price resolution is unhealthy.
      const left = await readBatch(batch.slice(0, midpoint));
      const right = await readBatch(batch.slice(midpoint));
      return {
        prices: new Map([...left.prices, ...right.prices]),
        brokenSkus: [...left.brokenSkus, ...right.brokenSkus],
      };
    }
  }

  const result = await readBatch(skus);
  // Every price failing strongly indicates a systemic fault. Do not pretend
  // prices are merely unavailable for every item in a full catalogue page.
  if (skus.length > 1 && result.brokenSkus.length === skus.length) {
    throw originalPriceError || new Error("Catalogue prices are unavailable.");
  }

  for (const sku of result.brokenSkus) {
    const safeSku = sku.replace(/[^A-Za-z0-9._/-]/g, "_").slice(0, 80);
    console.warn(`[store:catalogue-price] Price unavailable for SKU ${safeSku}`);
  }

  return result.prices;
}
