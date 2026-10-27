import { getCustomerToken } from "@/lib/session";
import { getCustomerContext } from "@/lib/magento/context";
import { getReservedPunchOutCustomerIds } from "@/lib/punchout/config";
import { getPunchOutBrowserToken } from "@/lib/punchout/browser-session";

export async function isReservedPunchOutCustomer(token: string) {
  const reserved = getReservedPunchOutCustomerIds();
  if (!reserved.length) return false;
  const current = await getCustomerContext(token);
  return reserved.includes(current.css_company_context.customer_id ?? 0);
}
export async function assertNormalCheckoutSession() {
  // Enforce this from every server-side checkout action, not just the button.
  // Expiry/deletion of the browser PunchOut cookie cannot reopen checkout.
  if (await getPunchOutBrowserToken()) {
    throw new Error("Return your basket to your purchasing system.");
  }
  const token = await getCustomerToken();
  if (token && await isReservedPunchOutCustomer(token)) {
    throw new Error("This account is reserved for PunchOut ordering.");
  }
}
