import { cartHasItems, getCustomerCartSummary, removeCartItem } from "@/lib/magento/cart";
import { getCustomerContext } from "@/lib/magento/context";
import type { PunchOutSession } from "@/lib/punchout/session";

export async function verifyPunchOutCustomerToken(
  session: Pick<PunchOutSession, "customerId" | "companyId">,
  token: string,
  options: { requireEmptyCart?: boolean } = {},
) {
  const context = await getCustomerContext(token);
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
