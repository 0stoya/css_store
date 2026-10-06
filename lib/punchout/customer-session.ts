import { cartHasItems, getCustomerCartSummary } from "@/lib/magento/cart";
import { getCustomerContext } from "@/lib/magento/context";
import type { EnabledPunchOutConfig } from "@/lib/punchout/config";

export async function verifyPunchOutCustomerToken(
  config: EnabledPunchOutConfig,
  token: string,
  options: { requireEmptyCart?: boolean } = {},
) {
  const context = await getCustomerContext(token);
  const company = context.css_company_context.companies.find(
    (candidate) => candidate.company_id === config.companyId,
  );

  if (
    !context.css_company_context.authenticated
    || context.css_company_context.customer_id !== config.magentoCustomerId
    || !company
    || !company.active
    || context.css_company_context.selected_company_id !== config.companyId
    || !context.css_ordering_capabilities.authenticated
    || !context.css_ordering_capabilities.company_context
    || context.css_ordering_capabilities.company_id !== config.companyId
    || !context.css_ordering_capabilities.company_active
  ) {
    throw new Error("The Magento session does not match the configured PunchOut customer/company.");
  }

  if (options.requireEmptyCart) {
    const cart = await getCustomerCartSummary(token);
    if (cartHasItems(cart)) {
      throw new Error("The configured PunchOut customer basket must be empty before starting a new session.");
    }
  }

  return context;
}
