import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";

export type CartItemSnapshot = {
  uid: string;
  quantity: number;
  product: { sku: string };
  css_employee: { employee_id: number | null; employee_name: string } | null;
};

export type CartSnapshot = {
  id: string;
  itemsV2: { items: CartItemSnapshot[] };
};

const CART_FIELDS = /* GraphQL */ `
  id
  itemsV2 {
    items {
      uid
      quantity
      product { sku }
      css_employee { employee_id employee_name }
    }
  }
`;

const CUSTOMER_CART = /* GraphQL */ `
  query StoreCustomerCart {
    customerCart { ${CART_FIELDS} }
  }
`;

const ADD_PRODUCTS = /* GraphQL */ `
  mutation StoreAddProducts($cartId: String!, $items: [CartItemInput!]!) {
    addProductsToCart(cartId: $cartId, cartItems: $items) {
      cart { ${CART_FIELDS} }
      user_errors { code message }
    }
  }
`;

const ADD_GROUPED_CONFIGURABLE = /* GraphQL */ `
  mutation StoreAddGroupedConfigurable($input: CssAddGroupedConfigurableProductsToCartInput!) {
    cssAddGroupedConfigurableProductsToCart(input: $input) {
      cart { ${CART_FIELDS} }
      purchase_decision {
        logical_product_id
        has_active_restriction
        allowed_quantity
        purchased_quantity
        remaining_quantity
        requested_quantity
        status
        reason
      }
    }
  }
`;

const ASSIGN_CART_EMPLOYEE = /* GraphQL */ `
  mutation StoreAssignCartEmployee($cartId: String!, $employeeId: Int!) {
    cssAssignCartEmployee(cart_id: $cartId, employee_id: $employeeId) {
      ${CART_FIELDS}
    }
  }
`;

const ASSIGN_ITEM_EMPLOYEE = /* GraphQL */ `
  mutation StoreAssignCartItemEmployee($cartId: String!, $itemUid: ID!, $employeeId: Int!) {
    cssAssignCartItemEmployee(cart_id: $cartId, item_uid: $itemUid, employee_id: $employeeId) {
      ${CART_FIELDS}
    }
  }
`;

export async function getCustomerCart(token: string) {
  const data = await magentoGraphQL<{ customerCart: CartSnapshot }>(CUSTOMER_CART, {}, token);
  return data.customerCart;
}

export async function addNativeProduct(
  token: string,
  cartId: string,
  input: { sku: string; quantity: number; selectedOptions?: string[] },
) {
  const data = await magentoGraphQL<{
    addProductsToCart: {
      cart: CartSnapshot;
      user_errors: Array<{ code: string; message: string }>;
    };
  }>(
    ADD_PRODUCTS,
    {
      cartId,
      items: [
        {
          sku: input.sku,
          quantity: input.quantity,
          ...(input.selectedOptions?.length ? { selected_options: input.selectedOptions } : {}),
        },
      ],
    },
    token,
  );

  const error = data.addProductsToCart.user_errors[0];
  if (error) throw new MagentoGraphQLError(error.message, error.code);
  return data.addProductsToCart.cart;
}

export async function addGroupedConfigurableProduct(
  token: string,
  input: {
    cartId: string;
    parentSku: string;
    employeeId?: number;
    items: Array<{ configurableSku: string; variantSku: string; quantity: number }>;
  },
) {
  const data = await magentoGraphQL<{
    cssAddGroupedConfigurableProductsToCart: {
      cart: CartSnapshot;
      purchase_decision: { status: string; reason: string | null };
    };
  }>(
    ADD_GROUPED_CONFIGURABLE,
    {
      input: {
        cart_id: input.cartId,
        parent_sku: input.parentSku,
        ...(input.employeeId ? { employee_id: input.employeeId } : {}),
        items: input.items.map((item) => ({
          configurable_sku: item.configurableSku,
          variant_sku: item.variantSku,
          quantity: item.quantity,
        })),
      },
    },
    token,
  );

  const result = data.cssAddGroupedConfigurableProductsToCart;
  if (result.purchase_decision.status === "NOT_ALLOWED") {
    throw new MagentoGraphQLError(
      result.purchase_decision.reason || "Fluid rejected this purchase request.",
      result.purchase_decision.status,
    );
  }
  return result.cart;
}

export async function assignCartEmployee(token: string, cartId: string, employeeId: number) {
  const data = await magentoGraphQL<{ cssAssignCartEmployee: CartSnapshot }>(
    ASSIGN_CART_EMPLOYEE,
    { cartId, employeeId },
    token,
  );
  return data.cssAssignCartEmployee;
}

export async function assignCartItemEmployee(
  token: string,
  cartId: string,
  itemUid: string,
  employeeId: number,
) {
  const data = await magentoGraphQL<{ cssAssignCartItemEmployee: CartSnapshot }>(
    ASSIGN_ITEM_EMPLOYEE,
    { cartId, itemUid, employeeId },
    token,
  );
  return data.cssAssignCartItemEmployee;
}
