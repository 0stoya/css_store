import { magentoGraphQL } from "@/lib/magento/client";
import type { PurchaseAllowance, PurchaseConstraints, StockInfo } from "@/lib/magento/catalogue";

export type ConfigurableOption = {
  uid: string;
  attribute_code: string;
  label: string;
  values: Array<{ uid: string; label: string }>;
};

export type ConfigurableVariant = {
  attributes: Array<{ uid: string; code: string; label: string; value_index: number }>;
  product: { sku: string; name: string; stock_status: string | null };
};

export type ProductPriceRange = {
  minimum_price: {
    regular_price: { value: number; currency: string };
    final_price: { value: number; currency: string };
  };
};

export type GroupedProductChild = {
  __typename: string;
  uid: string;
  sku: string;
  name: string;
  stock_status: string | null;
  price_range: ProductPriceRange | null;
  css_purchase_allowance: PurchaseAllowance | null;
  css_stock_info: StockInfo;
  css_purchase_constraints: PurchaseConstraints | null;
  configurable_options?: ConfigurableOption[] | null;
  variants?: ConfigurableVariant[] | null;
};

export type ProductConfiguration = {
  __typename: string;
  uid: string;
  sku: string;
  name: string;
  url_key: string | null;
  stock_status: string | null;
  description: { html: string } | null;
  media_gallery: Array<{ url: string; label: string | null; position: number | null }> | null;
  price_range: ProductPriceRange | null;
  css_purchase_allowance: PurchaseAllowance | null;
  css_stock_info: StockInfo;
  css_purchase_constraints: PurchaseConstraints | null;
  configurable_options?: ConfigurableOption[] | null;
  variants?: ConfigurableVariant[] | null;
  items?: Array<{
    qty: number | null;
    position: number | null;
    product: GroupedProductChild;
  }> | null;
};

const CONFIGURABLE_CONFIGURATION_FIELDS = /* GraphQL */ `
  configurable_options {
    uid
    attribute_code
    label
    values { uid label }
  }
  variants {
    attributes { uid code label value_index }
    product { sku name stock_status }
  }
`;

const GROUPED_CHILD_FIELDS = /* GraphQL */ `
  __typename
  uid
  sku
  name
  stock_status
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
  css_stock_info { available stock_status delivery_message }
  css_purchase_constraints {
    minimum_quantity
    maximum_quantity
    quantity_increment
    increments_enforced
  }
  ... on ConfigurableProduct {
    ${CONFIGURABLE_CONFIGURATION_FIELDS}
  }
`;

const PRODUCT = /* GraphQL */ `
  query StoreProduct($sku: String!) {
    products(filter: { sku: { eq: $sku } }, pageSize: 1, currentPage: 1) {
      items {
        __typename
        uid
        sku
        name
        url_key
        stock_status
        description { html }
        media_gallery { url label position }
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
        css_stock_info { available stock_status delivery_message }
        css_purchase_constraints {
          minimum_quantity
          maximum_quantity
          quantity_increment
          increments_enforced
        }
        ... on ConfigurableProduct {
          ${CONFIGURABLE_CONFIGURATION_FIELDS}
        }
        ... on CssGroupedConfigurableProduct {
          items {
            qty
            position
            product {
              ${GROUPED_CHILD_FIELDS}
            }
          }
        }
        ... on GroupedProduct {
          items {
            qty
            position
            product {
              ${GROUPED_CHILD_FIELDS}
            }
          }
        }
      }
    }
  }
`;

export async function getProduct(token: string, sku: string): Promise<ProductConfiguration | null> {
  const data = await magentoGraphQL<{ products: { items: ProductConfiguration[] } }>(PRODUCT, { sku }, token);
  return data.products.items.find((item) => item?.sku === sku) || null;
}
