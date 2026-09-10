import Link from "next/link";
import { getStoreName } from "@/lib/config";
import { getCustomerCart } from "@/lib/magento/cart";
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
      if (token) quantity = (await getCustomerCart(token)).total_quantity;
    } catch {
      quantity = undefined;
    }
  }

  return (
    <header className="site-header">
      <Link className="brand" href="/">{getStoreName()}</Link>
      <nav aria-label="Store navigation">
        <Link href="/catalogue">Products</Link>
        {customerName ? <Link href="/basket">Basket{typeof quantity === "number" && quantity > 0 ? ` (${quantity})` : ""}</Link> : null}
        {customerName ? <Link href="/account">Account</Link> : <Link href="/login">Sign in</Link>}
      </nav>
      {customerName ? <div className="identity"><strong>{customerName}</strong><span>{companyName || "No company selected"}</span></div> : null}
    </header>
  );
}
