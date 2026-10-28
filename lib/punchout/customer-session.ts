import { cartHasItems, getCustomerCartSummary, removeCartItem } from "@/lib/magento/cart";
import { magentoGraphQL } from "@/lib/magento/client";
import type { CustomerContext } from "@/lib/magento/context";
import type { PunchOutSession } from "@/lib/punchout/session";

const PUNCHOUT_CONTEXT = [
  "query PunchOutFreshCustomerContext {",
  "  customer { firstname lastname email }",
  "  css_company_context { authenticated customer_id selected_company_id",
  "    companies { company_id company_user_id name reference active selected } }",
  "  css_ordering_capabilities { authenticated company_context company_id company_user_id company_active }",
  "  css_storefront_policy { authenticated hide_price hide_add_to_cart add_to_cart_label }",
  "}",
].join("\n");
export function getFreshPunchOutContext(token: string) {
  // Do not use React cache after a company-switch mutation within one request.
  return magentoGraphQL<CustomerContext>(PUNCHOUT_CONTEXT, {}, token);
}

export async function verifyPunchOutCustomerToken(
  session: Pick<PunchOutSession, "customerId" | "companyId">,
  token: string,
  options: { requireEmptyCart?: boolean } = {},
) {
  const context = await getFreshPunchOutContext(token);
  const company = context.css_company_context.companies.find(
    (candidate) => candidate.company_id === session.companyId,
  );
  if (!context.css_company_context.authenticated ||
      context.css_company_context.customer_id !== session.customerId ||
      !company?.active || context.css_company_context.selected_company_id !== session.companyId ||
      !context.css_ordering_capabilities.authenticated || !context.css_ordering_capabilities.company_context ||
      context.css_ordering_capabilities.company_id !== session.companyId ||
      !context.css_ordering_capabilities.company_active) {
    throw new Error("Magento customer/company context does not match the PunchOut session.");
  }
  if (options.requireEmptyCart) {
    const cart = await getCustomerCartSummary(token);
    if (cartHasItems(cart)) throw new Error("PunchOut technical customer has a non-empty cart.");
  }
}
export async function clearLeasedPunchOutCart(token: string) {
  // Only call after acquiring a UNIQUE, active customer lease and verifying its
  // customer/company. This customer ID must be dedicated to PunchOut, never human login.
  const existing = await getCustomerCartSummary(token);
  if (existing.itemsV2.items.length > 250) throw new Error("PunchOut principal cart requires manual cleanup.");
  for (const item of existing.itemsV2.items) {
    await removeCartItem(token, existing.id, item.uid);
  }
  if (cartHasItems(await getCustomerCartSummary(token))) throw new Error("PunchOut cart was not emptied.");
}
