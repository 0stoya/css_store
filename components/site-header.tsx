import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getStoreName } from "@/lib/config";
import { getCustomerCartSummary } from "@/lib/magento/cart";
import { getCustomerToken } from "@/lib/session";

export async function SiteHeader({
  customerName,
  companyName,
  basketQuantity,
}: {
  customerName?: string;
  companyName?: string | null;
  basketQuantity?: number;
}) {
  let quantity = basketQuantity;

  if (customerName && quantity === undefined) {
    try {
      const token = await getCustomerToken();
      if (token) quantity = (await getCustomerCartSummary(token)).total_quantity;
    } catch (error) {
      unstable_rethrow(error);
      quantity = undefined;
    }
  }

  return <>
    <header className="site-header">
      <a className="skip-link" href="#main-content-start">Skip to main content</a>
      <Link className="brand" href="/">{getStoreName()}</Link>
      <nav aria-label="Store navigation">
        <Link href="/catalogue">Products</Link>
        {customerName ? <Link href="/basket">Basket{typeof quantity === "number" && quantity > 0 ? ` (${quantity})` : ""}</Link> : null}
        {customerName ? <Link href="/account">Account</Link> : <Link href="/login">Sign in</Link>}
      </nav>
      {customerName ? <div className="identity"><strong>{customerName}</strong><span>{companyName || "No company selected"}</span></div> : null}
    </header>
    <span id="main-content-start" className="content-anchor" tabIndex={-1}/>
  </>;
}
