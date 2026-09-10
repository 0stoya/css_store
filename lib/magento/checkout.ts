import { magentoGraphQL } from "@/lib/magento/client";
import type { CartEmployeeAssignment, CartKitMetadata, CartMoney } from "@/lib/magento/cart";
import type { SelectedShippingMethod } from "@/lib/magento/shipping";

export type CheckoutPaymentMethod = {
  code: string;
  title: string;
};

export type CheckoutCartItem = {
  uid: string;
  quantity: number;
  product: { sku: string; name: string };
  configured_variant?: { sku: string; name: string } | null;
  configurable_options?: Array<{ option_label: string; value_label: string }> | null;
  css_kit: CartKitMetadata | null;
  css_employee: CartEmployeeAssignment | null;
};

export type CheckoutShippingAddress = {
  firstname: string;
  lastname: string;
  company: string | null;
  street: string[];
  city: string;
  region: { code: string | null; label: string | null } | null;
  postcode: string;
  telephone: string;
  country: { code: string; label: string | null } | null;
  selected_shipping_method: SelectedShippingMethod | null;
};

export type CheckoutContext = {
  customer: {
    firstname: string;
    lastname: string;
  };
  customerCart: {
    id: string;
    total_quantity: number;
    itemsV2: { items: CheckoutCartItem[] };
    shipping_addresses: CheckoutShippingAddress[];
    available_payment_methods: CheckoutPaymentMethod[];
    selected_payment_method: CheckoutPaymentMethod | null;
    prices: {
      subtotal_excluding_tax: CartMoney | null;
      grand_total: CartMoney | null;
    } | null;
    css_purchase_eligibility: {
      approval_status: string;
    } | null;
  };
  css_ordering_capabilities: {
    authenticated: boolean;
    company_context: boolean;
    company_active: boolean;
    can_checkout: boolean;
    can_submit_credit_order: boolean;
    can_auto_approve_credit_order: boolean;
  };
};

export type CreditOrderSubmission = {
  credit_order_id: number;
  credit_order_number: string | null;
  status: string;
  auto_approved: boolean;
  approval_required: boolean;
  grand_total: number;
  payment_method: string | null;
  order_id: number | null;
  order_number: string | null;
  order_placed: boolean;
};

const CHECKOUT_CONTEXT = /* GraphQL */ `
  query StoreCheckoutContext {
    customer { firstname lastname }
    customerCart {
      id
      total_quantity
      itemsV2 {
        items {
          uid
          quantity
          product { sku name }
          ... on ConfigurableCartItem {
            configured_variant { sku name }
            configurable_options { option_label value_label }
          }
          css_kit { employee_id employee_name employee_code parent_kit_product_id }
          css_employee { employee_id employee_name employee_code }
        }
      }
      shipping_addresses {
        firstname
        lastname
        company
        street
        city
        region { code label }
        postcode
        telephone
        country { code label }
        selected_shipping_method {
          carrier_code
          method_code
          carrier_title
          method_title
          amount { value currency }
        }
      }
      available_payment_methods { code title }
      selected_payment_method { code title }
      prices {
        subtotal_excluding_tax { value currency }
        grand_total { value currency }
      }
      css_purchase_eligibility { approval_status }
    }
    css_ordering_capabilities {
      authenticated
      company_context
      company_active
      can_checkout
      can_submit_credit_order
      can_auto_approve_credit_order
    }
  }
`;

const SET_BILLING_SAME_AS_SHIPPING = /* GraphQL */ `
  mutation StoreSetBillingSameAsShipping($cartId: String!) {
    setBillingAddressOnCart(
      input: {
        cart_id: $cartId
        billing_address: { same_as_shipping: true }
      }
    ) {
      cart { id }
    }
  }
`;

const SET_PAYMENT_METHOD = /* GraphQL */ `
  mutation StoreSetPaymentMethod($cartId: String!, $code: String!) {
    setPaymentMethodOnCart(
      input: {
        cart_id: $cartId
        payment_method: { code: $code }
      }
    ) {
      cart {
        id
        selected_payment_method { code title }
      }
    }
  }
`;

const PLACE_ORDER = /* GraphQL */ `
  mutation StorePlaceOrder($cartId: String!) {
    placeOrder(input: { cart_id: $cartId }) {
      order { order_number }
    }
  }
`;

const SUBMIT_CREDIT_ORDER = /* GraphQL */ `
  mutation StoreSubmitCreditOrder($cartId: String!) {
    cssSubmitCreditOrder(input: { cart_id: $cartId }) {
      credit_order_id
      credit_order_number
      status
      auto_approved
      approval_required
      grand_total
      payment_method
      order_id
      order_number
      order_placed
    }
  }
`;

export function getCheckoutContext(token: string) {
  return magentoGraphQL<CheckoutContext>(CHECKOUT_CONTEXT, {}, token);
}

export async function setBillingSameAsShipping(token: string, cartId: string) {
  const data = await magentoGraphQL<{
    setBillingAddressOnCart: { cart: { id: string } };
  }>(SET_BILLING_SAME_AS_SHIPPING, { cartId }, token);
  return data.setBillingAddressOnCart.cart;
}

export async function setCheckoutPaymentMethod(token: string, cartId: string, code: string) {
  const data = await magentoGraphQL<{
    setPaymentMethodOnCart: {
      cart: { id: string; selected_payment_method: CheckoutPaymentMethod | null };
    };
  }>(SET_PAYMENT_METHOD, { cartId, code }, token);
  return data.setPaymentMethodOnCart.cart;
}

export async function placeCheckoutOrder(token: string, cartId: string) {
  const data = await magentoGraphQL<{
    placeOrder: { order: { order_number: string } };
  }>(PLACE_ORDER, { cartId }, token);
  return data.placeOrder.order;
}

export async function submitCreditOrder(token: string, cartId: string) {
  const data = await magentoGraphQL<{
    cssSubmitCreditOrder: CreditOrderSubmission;
  }>(SUBMIT_CREDIT_ORDER, { cartId }, token);
  return data.cssSubmitCreditOrder;
}
