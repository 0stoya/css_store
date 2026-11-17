import { MagentoGraphQLError, magentoGraphQL } from "@/lib/magento/client";
import type { CartMoney } from "@/lib/magento/cart";

export type OrderOption = {
  label: string;
  value: string;
};

export type CompanyOrderItem = {
  id: string;
  product_name: string;
  product_sku: string;
  product_type: string | null;
  quantity_ordered: number;
  quantity_shipped: number;
  quantity_refunded: number;
  quantity_canceled: number;
  product_sale_price: CartMoney | null;
  selected_options: OrderOption[] | null;
  entered_options: OrderOption[] | null;
  css_employee: {
    employee_id: number | null;
    employee_name: string;
    employee_code: string | null;
  } | null;
};

export type CompanyOrder = {
  number: string;
  order_date: string;
  status: string;
  items: CompanyOrderItem[];
  total: {
    subtotal_excl_tax: CartMoney | null;
    total_shipping: CartMoney | null;
    total_tax: CartMoney | null;
    grand_total: CartMoney | null;
    discounts: Array<{
      label: string;
      amount: CartMoney;
    }> | null;
  };
};

export type CompanyOrdersPage = {
  customer: {
    firstname: string;
    lastname: string;
    email: string;
  };
  css_company_context: {
    selected_company_id: number | null;
    companies: Array<{
      company_id: number;
      name: string | null;
      reference: string | null;
      selected: boolean;
    }>;
  };
  css_ordering_capabilities: {
    authenticated: boolean;
    company_context: boolean;
    company_active: boolean;
    can_view_own_orders: boolean;
    can_view_company_orders: boolean;
  };
  css_company_orders: {
    total_count: number;
    items: CompanyOrder[];
    page_info: {
      page_size: number;
      current_page: number;
      total_pages: number;
    };
  };
};

const COMPANY_ORDERS = /* GraphQL */ `
  query StoreCompanyOrders($currentPage: Int!, $pageSize: Int!) {
    customer { firstname lastname email }
    css_company_context {
      selected_company_id
      companies { company_id name reference selected }
    }
    css_ordering_capabilities {
      authenticated
      company_context
      company_active
      can_view_own_orders
      can_view_company_orders
    }
    css_company_orders(currentPage: $currentPage, pageSize: $pageSize) {
      total_count
      page_info { page_size current_page total_pages }
      items {
        number
        order_date
        status
        items {
          id
          product_name
          product_sku
          product_type
          quantity_ordered
          quantity_shipped
          quantity_refunded
          quantity_canceled
          product_sale_price { value currency }
          selected_options { label value }
          entered_options { label value }
          css_employee { employee_id employee_name employee_code }
        }
        total {
          subtotal_excl_tax { value currency }
          total_shipping { value currency }
          total_tax { value currency }
          grand_total { value currency }
          discounts { label amount { value currency } }
        }
      }
    }
  }
`;

export function getCompanyOrders(token: string, currentPage: number, pageSize = 10) {
  return magentoGraphQL<CompanyOrdersPage>(COMPANY_ORDERS, { currentPage, pageSize }, token);
}


/** Latest visible sales order, using the same Magento company/store/role scope
 * as Order history. It is a "placed today" signal, NOT an unread counter.
 * One order/date only; do not load the full history in every Account layout. */
const LATEST_COMPANY_ORDER_DATE = /* GraphQL */ `
  query StoreLatestCompanyOrderDate {
    css_company_orders(currentPage: 1, pageSize: 1) {
      items { order_date }
    }
  }
`;

export async function getLatestCompanyOrderDate(token: string): Promise<string | null> {
  try {
    const data = await magentoGraphQL<{
      css_company_orders: { items: Array<{ order_date: string | null }> };
    }>(LATEST_COMPANY_ORDER_DATE, {}, token);
    return data.css_company_orders.items[0]?.order_date || null;
  } catch (error) {
    // This is optional navigation decoration: orders ACL or a temporary order
    // query issue must not prevent customers accessing their account.
    // Genuine invalid-token redirects from magentoGraphQL still propagate.
    if (error instanceof MagentoGraphQLError) return null;
    throw error;
  }
}

/** Magento formats order_date as dd/mm/YYYY HH:mm:ss in its store timezone.
 * Our UK storefront uses Europe/London; test calendar-day recency, not
 * unread status (which would need a separate acknowledgement record). */
export function hasCompanyOrderPlacedToday(orderDate: string | null, now: Date = new Date()): boolean {
  const match = /^(\\d{2})\/(\\d{2})\/(\\d{4})(?:\\s|$)/.exec(orderDate || "");
  if (!match) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(now);
  const today = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(match[1]) === Number(today.day)
    && Number(match[2]) === Number(today.month)
    && Number(match[3]) === Number(today.year);
}
