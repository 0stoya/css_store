import { getCustomerToken } from "@/lib/session";
import { hasPendingAccountActions } from "@/lib/magento/account-action-attention";

/** The Account layout passes an existing queue result; elsewhere the header
 * checks the two scopes server-side without adding a new Magento endpoint. */
export async function AccountActionAttention({ knownPending }: { knownPending?: boolean }) {
  let pending = knownPending;
  if (pending === undefined) {
    const token = await getCustomerToken();
    pending = token ? await hasPendingAccountActions(token) : false;
  }
  if (!pending) return null;

  return <>
    <span className="account-action-attention" aria-hidden="true"/>
    <span className="sr-only">Account tasks waiting</span>
  </>;
}
