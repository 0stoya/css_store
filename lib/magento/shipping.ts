import { magentoGraphQL } from "@/lib/magento/client";
import type { CartEmployeeAssignment, CartKitMetadata, CartMoney } from "@/lib/magento/cart";

export type CustomerShippingAddress = {
  id: number;
  firstname: string;
  lastname: string;
  company: string | null;
  street: string[];
  city: string;
  region: { region: string | null; region_code: string | null } | null;
  postcode: string;
  country_code: string;
  telephone: string;
  default_shipping: boolean;
};

export type ShippingMethod = {
  available: boolean;
  carrier_code: string;
  method_code: string;
  carrier_title: string | null;
  method_title: string | null;
  amount: CartMoney | null;
  error_message: string | null;
};

export type ShippingCartAddress = {
  firstname: string;
  lastname: string;
  company: string | null;
  street: string[];
  city: string;
  region: { code: string | null; label: string | null } | null;
  postcode: string;
  telephone: string;
  country: { code: string; label: string | null } | null;
  available_shipping_methods: ShippingMethod[];
  selected_shipping_method: Omit<ShippingMethod, "available" | "error_message"> | null;
};

export type DeliveryCartItem = {
  uid: string;
  quantity: number;
  product: { sku: string; name: string };
  configured_variant?: { sku: string; name: string } | null;
  configurable_options?: Array<{ option_label: string; value_label: string }> | null;
  css_kit: CartKitMetadata | null;
  css_employee: CartEmployeeAssignment | null;
};

export type DeliveryContext = {
  customer: {
    firstname: string;
    lastname: string;
    addresses: CustomerShippingAddress[];
  };
  customerCart: {
    id: string;
    total_quantity: number;
    itemsV2: { items: DeliveryCartItem[] };
    shipping_addresses: ShippingCartAddress[];
    prices: {
      subtotal_excluding_tax: CartMoney | null;
      grand_total: CartMoney | null;
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

const SHIPPING_METHOD_FIELDS = /* GraphQL */ `
  available
  carrier_code
  method_code
  carrier_title
  method_title
  amount { value currency }
  error_message
`;

const SHIPPING_ADDRESS_FIELDS = /* GraphQL */ `
  firstname
  lastname
  company
  street
  city
  region { code label }
  postcode
  telephone
  country { code label }
  available_shipping_methods { ${SHIPPING_METHOD_FIELDS} }
  selected_shipping_method {
    carrier_code
    method_code
    carrier_title
    method_title
    amount { value currency }
  }
`;

const DELIVERY_CONTEXT = /* GraphQL */ `
  query StoreDeliveryContext {
    customer {
      firstname
      lastname
      addresses {
        id
        firstname
        lastname
        company
        street
        city
        region { region region_code }
        postcode
        country_code
        telephone
        default_shipping
      }
    }
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
      shipping_addresses { ${SHIPPING_ADDRESS_FIELDS} }
      prices {
        subtotal_excluding_tax { value currency }
        grand_total { value currency }
      }
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

const SET_SAVED_ADDRESS = /* GraphQL */ `
  mutation StoreSetSavedShippingAddress($cartId: String!, $customerAddressId: Int!) {
    setShippingAddressesOnCart(
      input: {
        cart_id: $cartId
        shipping_addresses: [{ customer_address_id: $customerAddressId }]
      }
    ) {
      cart {
        id
        total_quantity
        shipping_addresses { ${SHIPPING_ADDRESS_FIELDS} }
      }
    }
  }
`;

const SET_NEW_ADDRESS = /* GraphQL */ `
  mutation StoreSetNewShippingAddress($cartId: String!, $address: CartAddressInput!) {
    setShippingAddressesOnCart(
      input: {
        cart_id: $cartId
        shipping_addresses: [{ address: $address }]
      }
    ) {
      cart {
        id
        total_quantity
        shipping_addresses { ${SHIPPING_ADDRESS_FIELDS} }
      }
    }
  }
`;

const SET_SHIPPING_METHOD = /* GraphQL */ `
  mutation StoreSetShippingMethod($cartId: String!, $carrierCode: String!, $methodCode: String!) {
    setShippingMethodsOnCart(
      input: {
        cart_id: $cartId
        shipping_methods: [{ carrier_code: $carrierCode, method_code: $methodCode }]
      }
    ) {
      cart {
        id
        total_quantity
        shipping_addresses { ${SHIPPING_ADDRESS_FIELDS} }
        prices {
          subtotal_excluding_tax { value currency }
          grand_total { value currency }
        }
      }
    }
  }
`;

export function getDeliveryContext(token: string) {
  return magentoGraphQL<DeliveryContext>(DELIVERY_CONTEXT, {}, token);
}

export async function setSavedShippingAddress(token: string, cartId: string, customerAddressId: number) {
  const data = await magentoGraphQL<{
    setShippingAddressesOnCart: { cart: DeliveryContext["customerCart"] };
  }>(SET_SAVED_ADDRESS, { cartId, customerAddressId }, token);
  return data.setShippingAddressesOnCart.cart;
}

export async function setNewShippingAddress(
  token: string,
  cartId: string,
  address: {
    firstname: string;
    lastname: string;
    company?: string;
    street: string[];
    city: string;
    region?: string;
    postcode: string;
    country_code: string;
    telephone: string;
    save_in_address_book: false;
  },
) {
  const data = await magentoGraphQL<{
    setShippingAddressesOnCart: { cart: DeliveryContext["customerCart"] };
  }>(SET_NEW_ADDRESS, { cartId, address }, token);
  return data.setShippingAddressesOnCart.cart;
}

export async function setShippingMethod(
  token: string,
  cartId: string,
  carrierCode: string,
  methodCode: string,
) {
  const data = await magentoGraphQL<{
    setShippingMethodsOnCart: { cart: DeliveryContext["customerCart"] };
  }>(SET_SHIPPING_METHOD, { cartId, carrierCode, methodCode }, token);
  return data.setShippingMethodsOnCart.cart;
}
