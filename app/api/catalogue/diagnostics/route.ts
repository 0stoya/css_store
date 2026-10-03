import { NextResponse } from "next/server";
import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";
import { getCustomerToken } from "@/lib/session";

type DiagnosticProduct = {
  sku: string;
  name: string;
};

const PAGE_PRODUCTS = /* GraphQL */ `
  query StoreCatalogueDiagnosticProducts(
    $filter: ProductAttributeFilterInput!
    $page: Int!
    $pageSize: Int!
  ) {
    products(
      filter: $filter
      currentPage: $page
      pageSize: $pageSize
      sort: { name: ASC }
    ) {
      items { sku name }
    }
  }
`;

const CARD_FIELDS = /* GraphQL */ `
  query StoreCatalogueDiagnosticCardFields(
    $filter: ProductAttributeFilterInput!
    $pageSize: Int!
  ) {
    products(filter: $filter, currentPage: 1, pageSize: $pageSize) {
      items {
        sku
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
        css_stock_info {
          available
          stock_status
          delivery_message
        }
      }
    }
  }
`;


const PRODUCT_STRUCTURE = /* GraphQL */ `
  query StoreCatalogueDiagnosticStructure($sku: String!) {
    products(filter: { sku: { eq: $sku } }, currentPage: 1, pageSize: 1) {
      items {
        __typename
        sku
        name
        ... on ConfigurableProduct {
          variants {
            product {
              sku
              name
              stock_status
            }
          }
        }
        ... on GroupedProduct {
          items {
            product {
              __typename
              sku
              name
              stock_status
            }
          }
        }
      }
    }
  }
`;

const PRICE_FIELD = /* GraphQL */ `
  query StoreCatalogueDiagnosticPrice(
    $filter: ProductAttributeFilterInput!
    $pageSize: Int!
  ) {
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

const ALLOWANCE_FIELD = /* GraphQL */ `
  query StoreCatalogueDiagnosticAllowance(
    $filter: ProductAttributeFilterInput!
    $pageSize: Int!
  ) {
    products(filter: $filter, currentPage: 1, pageSize: $pageSize) {
      items {
        sku
        css_purchase_allowance {
          logical_product_id
          has_active_restriction
          allowed_quantity
          purchased_quantity
          remaining_quantity
        }
      }
    }
  }
`;

const STOCK_FIELD = /* GraphQL */ `
  query StoreCatalogueDiagnosticStock(
    $filter: ProductAttributeFilterInput!
    $pageSize: Int!
  ) {
    products(filter: $filter, currentPage: 1, pageSize: $pageSize) {
      items {
        sku
        css_stock_info {
          available
          stock_status
          delivery_message
        }
      }
    }
  }
`;

async function probe(token: string, skus: string[], query: string) {
  try {
    await magentoGraphQL(
      query,
      {
        filter: { sku: { in: skus } },
        pageSize: Math.max(1, skus.length),
      },
      token,
    );
    return { ok: true as const, error: null };
  } catch (error) {
    if (error instanceof MagentoGraphQLError) {
      return {
        ok: false as const,
        error: error.message,
      };
    }
    throw error;
  }
}


async function productStructure(token: string, sku: string) {
  const data = await magentoGraphQL<{
    products: {
      items: Array<{
        __typename: string;
        sku: string;
        name: string;
        variants?: Array<{
          product: {
            sku: string;
            name: string;
            stock_status: string | null;
          };
        }> | null;
        items?: Array<{
          product: {
            __typename: string;
            sku: string;
            name: string;
            stock_status: string | null;
          };
        }> | null;
      }>;
    };
  }>(
    PRODUCT_STRUCTURE,
    { sku },
    token,
  );

  return data.products.items[0] || null;
}

async function findFailingSkus(
  token: string,
  skus: string[],
): Promise<Array<{ sku: string; error: string }>> {
  if (!skus.length) return [];

  const result = await probe(token, skus, CARD_FIELDS);
  if (result.ok) return [];
  if (skus.length === 1) {
    return [{ sku: skus[0], error: result.error }];
  }

  const middle = Math.ceil(skus.length / 2);
  const [left, right] = await Promise.all([
    findFailingSkus(token, skus.slice(0, middle)),
    findFailingSkus(token, skus.slice(middle)),
  ]);

  return [...left, ...right];
}

export async function GET() {
  const token = await getCustomerToken();
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const page = await magentoGraphQL<{
      products: { items: DiagnosticProduct[] };
    }>(
      PAGE_PRODUCTS,
      {
        filter: { price: { to: "999999999" } },
        page: 1,
        pageSize: 24,
      },
      token,
    );

    const products = page.products.items || [];
    const productBySku = new Map(products.map((product) => [product.sku, product]));
    const failing = await findFailingSkus(
      token,
      products.map((product) => product.sku),
    );

    const details = await Promise.all(
      failing.map(async ({ sku, error }) => {
        const [price, allowance, stock] = await Promise.all([
          probe(token, [sku], PRICE_FIELD),
          probe(token, [sku], ALLOWANCE_FIELD),
          probe(token, [sku], STOCK_FIELD),
        ]);

        const structure = await productStructure(token, sku);
        const childSkus = [
          ...(structure?.variants || []).map((variant) => variant.product.sku),
          ...(structure?.items || []).map((item) => item.product.sku),
        ].filter(Boolean);
        const childPriceChecks = price.ok
          ? []
          : await Promise.all(
              childSkus.map(async (childSku) => ({
                sku: childSku,
                ...(await probe(token, [childSku], PRICE_FIELD)),
              })),
            );

        return {
          sku,
          name: productBySku.get(sku)?.name || null,
          combined_error: error,
          fields: {
            price_range: price,
            css_purchase_allowance: allowance,
            css_stock_info: stock,
          },
          structure,
          child_price_checks: childPriceChecks,
        };
      }),
    );

    return NextResponse.json({
      page: 1,
      page_size: 24,
      products,
      failing: details,
    });
  } catch (error) {
    if (error instanceof MagentoGraphQLError) {
      return NextResponse.json(
        {
          error: error.message,
          category: error.category || null,
          status: error.status || null,
        },
        { status: 502 },
      );
    }
    throw error;
  }
}
