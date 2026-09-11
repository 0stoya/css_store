import { ShoppingBasket, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ProductMegaMenu } from "@/components/product-mega-menu";
import { getStoreName } from "@/lib/config";
import { getMenuCategories, type MenuCategory } from "@/lib/magento/menu-categories";
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
  const quantity = basketQuantity;
  let categories: MenuCategory[] = [];

  if (customerName) {
    try {
      const token = await getCustomerToken();
      if (token) categories = await getMenuCategories(token);
    } catch {
      categories = [];
    }
  }

  return <>
    <header className="site-header">
      <a className="skip-link" href="#main-content-start">Skip to main content</a>
      <Link className="brand" href="/" aria-label={`${getStoreName()} home`}>
        <Image src="/css-logo.png" alt="" width={320} height={86} priority />
        <span className="sr-only">{getStoreName()}</span>
      </Link>
      <nav aria-label="Store navigation" className="store-nav">
        {customerName ? <Link className="store-nav-link store-nav-all-products" href="/catalogue">All products</Link> : null}
        {customerName ? <ProductMegaMenu categories={categories}/> : <Link href="/catalogue">Products</Link>}
        {customerName ? <Link className="store-nav-link" href="/basket">
          <ShoppingBasket size={16} strokeWidth={2.1} aria-hidden="true"/>
          <span>Basket{typeof quantity === "number" && quantity > 0 ? ` (${quantity})` : ""}</span>
        </Link> : null}
        {customerName ? <Link className="store-nav-link" href="/account">
          <UserRound size={16} strokeWidth={2.1} aria-hidden="true"/>
          <span>Account</span>
        </Link> : <Link href="/login">Sign in</Link>}
      </nav>
      {customerName ? <div className="identity">
        <strong title={customerName}>{customerName}</strong>
        <span title={companyName || "No company selected"}>{companyName || "No company selected"}</span>
      </div> : null}
    </header>
    <span id="main-content-start" className="content-anchor" tabIndex={-1}/>
  </>;
}
