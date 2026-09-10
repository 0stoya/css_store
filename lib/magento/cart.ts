import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";

export type CartMoney = {
  value: number;
  currency: string;
};

export type CartPurchaseDecision = {
  logical_product_id: number;
  has_active_restriction: boolean;
  allowed_quantity: number;
  purchased_quantity: number;
  remaining_quantity: number;
  requested_quantity: number;
  status: string;
  reason: string | null;
};

export type CartEmployeeAssignment = {
  employee_id: number | null;
  employee_name: string;
  employee_code: string | null;
};

export type CartKitMetadata = {
  employee_id: number | null;
  employee_name: string;
  employee_code: string;
  parent_kit_product_id: number;
};

export type CartWriteItemSnapshot = {
  uid: string;
  quantity: number;
  product: { sku: string };
  configured_variant?: { sku: string } | null;
  css_employee: CartEmployeeAssignment | null;
};

export type CartWriteSnapshot = {
  id: string;
  itemsV2: { items: CartWriteItemSnapshot[] };
};

export type CartSummarySnapshot = {
  id: string;
  total_quantity: number;
  itemsV2: { items: Array<{ uid: string }> };
};

export type CartItemSnapshot = {
  uid: string;
  quantity: number;
  product: {
    sku: string;
    name: string;
    stock_status: string | null;
    small_image: { url: string; label: string | null } | null;
    css_stock_info: {
      available: boolean;
      stock_status: string;
      delivery_message: string;
    };
    css_purchase_constraints: {
      minimum_quantity: number;
      maximum_quantity: number | null;
      quantity_increment: number;
      increments_enforced: boolean;
    } | null;
  };
  prices: {
    price: CartMoney | null;
    row_total: CartMoney | null;
  } | null;
  configured_variant?: { sku: string; name: string } | null;
  configurable_options?: Array<{ option_label: string; value_label: string }> | null;
  css_kit: CartKitMetadata | null;
  css_employee: CartEmployeeAssignment | null;
};

export type CartSnapshot = {
  id: string;
  total_quantity: number;
  itemsV2: { items: CartItemSnapshot[] };
  prices: {
    subtotal_excluding_tax: CartMoney | null;
    grand_total: CartMoney | null;
  } | null;
  css_purchase_eligibility: {
    approval_status: string;
    items: CartPurchaseDecision[];
  } | null;
  css_company_credit: {
    company_id: number;
    credit_id: number | null;
    has_credit_account: boolean;
    credit_limit: number | null;
    used_amount: number | null;
    remaining_amount: number | null;
    currency: string | null;
    allow_over_limit: boolean;
    cart_grand_total_in_credit_currency: number | null;
    credit_sufficient_for_cart: boolean;
    can_pay_on_account: boolean;
  } | null;
  css_company_discount: {
    applied: boolean;
    label: string;
    percent: number;
    amount: number;
    base_amount: number;
    currency: string;
    base_currency: string;
  };
};

const CART_WRITE_FIELDS = /* GraphQL */ `
  id
  itemsV2 {
    items {
      uid
      quantity
      product { sku }
      ... on ConfigurableCartItem { configured_variant { sku } }
      css_employee { employee_id employee_name employee_code }
    }
  }
`;

const CART_SUMMARY_FIELDS = /* GraphQL */ `
  id
  total_quantity
  itemsV2 { items { uid } }
`;

const CART_FIELDS = /* GraphQL */ `
  id
  total_quantity
  itemsV2 {
    items {
      uid
      quantity
      product {
        sku
        name
        stock_status
        small_image { url label }
        css_stock_info { available stock_status delivery_message }
        css_purchase_constraints {
          minimum_quantity
          maximum_quantity
          quantity_increment
          increments_enforced
        }
      }
      prices {
        price { value currency }
        row_total { value currency }
      }
      ... on ConfigurableCartItem {
        configured_variant { sku name }
        configurable_options { option_label value_label }
      }
      css_kit { employee_id employee_name employee_code parent_kit_product_id }
      css_employee { employee_id employee_name employee_code }
    }
  }
  prices {
    subtotal_excluding_tax { value currency }
    grand_total { value currency }
  }
  css_purchase_eligibility {
    approval_status
    items {
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
  css_company_credit {
    company_id
    credit_id
    has_credit_account
    credit_limit
    used_amount
    remaining_amount
    currency
    allow_over_limit
    cart_grand_total_in_credit_currency
    credit_sufficient_for_cart
    can_pay_on_account
  }
  css_company_discount { applied label percent amount base_amount currency base_currency }
`;

const CUSTOMER_CART = /* GraphQL */ `
  query StoreCustomerCart {
    customerCart { ${CART_FIELDS} }
  }
`;

const CUSTOMER_CART_WRITE = /* GraphQL */ `
  query StoreCustomerCartWriteContext {
    customerCart { ${CART_WRITE_FIELDS} }
  }
`;

const CUSTOMER_CART_SUMMARY = /* GraphQL */ `
  query StoreCustomerCartSummary {
    customerCart { ${CART_SUMMARY_FIELDS} }
  }
`;

const ADD_PRODUCTS = /* GraphQL */ `
  mutation StoreAddProducts($cartId: String!, $items: [CartItemInput!]!) {
    addProductsToCart(cartId: $cartId, cartItems: $items) {
      cart { ${CART_WRITE_FIELDS} }
      user_errors { code message }
    }
  }
`;

const UPDATE_CART_ITEM = /* GraphQL */ `
  mutation StoreUpdateCartItem($cartId: String!, $itemUid: ID!, $quantity: Float!) {
    updateCartItems(
      input: {
        cart_id: $cartId
        cart_items: [{ cart_item_uid: $itemUid, quantity: $quantity }]
      }
    ) {
      cart { ${CART_WRITE_FIELDS} }
    }
  }
`;

const REMOVE_CART_ITEM = /* GraphQL */ `
  mutation StoreRemoveCartItem($cartId: String!, $itemUid: ID!) {
    removeItemFromCart(input: { cart_id: $cartId, cart_item_uid: $itemUid }) {
      cart { ${CART_WRITE_FIELDS} }
    }
  }
`;

const ADD_GROUPED_CONFIGURABLE = /* GraphQL */ `
  mutation StoreAddGroupedConfigurable($input: CssAddGroupedConfigurableProductsToCartInput!) {
    cssAddGroupedConfigurableProductsToCart(input: $input) {
      cart { ${CART_WRITE_FIELDS} }
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
      ${CART_WRITE_FIELDS}
    }
  }
`;

const ASSIGN_ITEM_EMPLOYEE = /* GraphQL */ `
  mutation StoreAssignCartItemEmployee($cartId: String!, $itemUid: ID!, $employeeId: Int!) {
    cssAssignCartItemEmployee(cart_id: $cartId, item_uid: $itemUid, employee_id: $employeeId) {
      ${CART_WRITE_FIELDS}
    }
  }
`;

export async function getCustomerCart(token: string) {
  const data = await magentoGraphQL<{ customerCart: CartSnapshot }>(CUSTOMER_CART, {}, token);
  return data.customerCart;
}

export async function getCustomerCartWriteContext(token: string) {
  const data = await magentoGraphQL<{ customerCart: CartWriteSnapshot }>(CUSTOMER_CART_WRITE, {}, token);
  return data.customerCart;
}

export async function getCustomerCartSummary(token: string) {
  const data = await magentoGraphQL<{ customerCart: CartSummarySnapshot }>(CUSTOMER_CART_SUMMARY, {}, token);
  return data.customerCart;
}

export function cartHasItems(cart: Pick<CartSummarySnapshot, "total_quantity" | "itemsV2">) {
  return cart.total_quantity > 0 || cart.itemsV2.items.length > 0;
}

export async function addNativeProduct(
  token: string,
  cartId: string,
  input: { sku: string; quantity: number; selectedOptions?: string[] },
) {
  const data = await magentoGraphQL<{
    addProductsToCart: {
      cart: CartWriteSnapshot;
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

export async function updateCartItem(token: string, cartId: string, itemUid: string, quantity: number) {
  const data = await magentoGraphQL<{ updateCartItems: { cart: CartWriteSnapshot } }>(
    UPDATE_CART_ITEM,
    { cartId, itemUid, quantity },
    token,
  );
  return data.updateCartItems.cart;
}

export async function removeCartItem(token: string, cartId: string, itemUid: string) {
  const data = await magentoGraphQL<{ removeItemFromCart: { cart: CartWriteSnapshot } }>(
    REMOVE_CART_ITEM,
    { cartId, itemUid },
    token,
  );
  return data.removeItemFromCart.cart;
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
      cart: CartWriteSnapshot;
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
  const data = await magentoGraphQL<{ cssAssignCartEmployee: CartWriteSnapshot }>(
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
  const data = await magentoGraphQL<{ cssAssignCartItemEmployee: CartWriteSnapshot }>(
    ASSIGN_ITEM_EMPLOYEE,
    { cartId, itemUid, employeeId },
    token,
  );
  return data.cssAssignCartItemEmployee;
}
