import { magentoGraphQL } from "@/lib/magento/client";

export type CompanySummary = {
  company_id: number;
  company_user_id: number;
  name: string | null;
  reference: string | null;
  active: boolean;
  selected: boolean;
};

export type CustomerContext = {
  customer: { firstname: string; lastname: string; email: string };
  css_company_context: {
    authenticated: boolean;
    customer_id: number | null;
    selected_company_id: number | null;
    companies: CompanySummary[];
  };
  css_ordering_capabilities: {
    authenticated: boolean;
    company_context: boolean;
    company_id: number | null;
    company_user_id: number | null;
    company_active: boolean;
  };
  css_storefront_policy: {
    authenticated: boolean;
    hide_price: boolean;
    hide_add_to_cart: boolean;
    add_to_cart_label: string | null;
  };
};

const CONTEXT = /* GraphQL */ `
  query StoreCustomerContext {
    customer { firstname lastname email }
    css_company_context {
      authenticated customer_id selected_company_id
      companies { company_id company_user_id name reference active selected }
    }
    css_ordering_capabilities { authenticated company_context company_id company_user_id company_active }
    css_storefront_policy { authenticated hide_price hide_add_to_cart add_to_cart_label }
  }
`;

const SELECT_COMPANY = /* GraphQL */ `
  mutation StoreSelectCompany($companyId: Int) {
    cssSelectCompany(company_id: $companyId) {
      authenticated customer_id selected_company_id
      companies { company_id company_user_id name reference active selected }
    }
  }
`;

export function getCustomerContext(token: string) {
  return magentoGraphQL<CustomerContext>(CONTEXT, {}, token);
}

export function selectCompany(token: string, companyId: number) {
  return magentoGraphQL(SELECT_COMPANY, { companyId }, token);
}
