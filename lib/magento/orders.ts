import { magentoGraphQL } from "@/lib/magento/client";
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
  prices: {
    row_total: CartMoney;
  } | null;
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
          prices { row_total { value currency } }
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
