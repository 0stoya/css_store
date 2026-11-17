import { MagentoGraphQLError } from "@/lib/magento/client";
import { getCreditOrderScopeCount } from "@/lib/magento/credit-orders";

/** Alert only for pending tasks authorised for the selected company/user. */
export async function hasPendingAccountActions(token: string): Promise<boolean> {
  try {
    const [approvalCount, poCount] = await Promise.all([
      getCreditOrderScopeCount(token, "APPROVAL"),
      getCreditOrderScopeCount(token, "PO"),
    ]);
    return (approvalCount ?? 0) > 0 || (poCount ?? 0) > 0;
  } catch (error) {
    // Attention is optional: a temporary Magento failure must not stop Store.
    // Actual authentication redirects are not MagentoGraphQLError.
    if (error instanceof MagentoGraphQLError) return false;
    throw error;
  }
}
