import Image from "next/image";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getStoreName } from "@/lib/config";
import { getCustomerCartSummary } from "@/lib/magento/cart";
import { getCategories, type StoreCategory } from "@/lib/magento/catalogue";
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
  let categories: StoreCategory[] = [];

  if (customerName) {
    try {
      const token = await getCustomerToken();
      if (token) {
        const [summary, menuCategories] = await Promise.all([
          quantity === undefined ? getCustomerCartSummary(token) : Promise.resolve(null),
          getCategories(token),
        ]);
        if (summary) quantity = summary.total_quantity;
        categories = menuCategories;
      }
    } catch (error) {
      unstable_rethrow(error);
      quantity = undefined;
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
        {customerName ? <details className="products-mega">
          <summary>Products</summary>
          <div className="mega-menu">
            <div className="mega-menu-heading">
              <div>
                <strong>Shop products</strong>
                <span>Browse all products or choose a category.</span>
              </div>
              <Link href="/catalogue">View all products</Link>
            </div>
            <div className="mega-menu-grid">
              {categories.map((category) => <Link
                className="mega-menu-category"
                href={`/catalogue/category/${encodeURIComponent(category.url_key || category.uid)}`}
                key={category.uid}
              >
                <span>
                  <strong>{category.name}</strong>
                  <small>{category.product_count} product{category.product_count === 1 ? "" : "s"}</small>
                </span>
                <span aria-hidden="true">›</span>
              </Link>)}
            </div>
          </div>
        </details> : <Link href="/catalogue">Products</Link>}
        {customerName ? <Link href="/basket">Basket{typeof quantity === "number" && quantity > 0 ? ` (${quantity})` : ""}</Link> : null}
        {customerName ? <Link href="/account">Account</Link> : <Link href="/login">Sign in</Link>}
      </nav>
      {customerName ? <div className="identity">
        <strong title={customerName}>{customerName}</strong>
        <span title={companyName || "No company selected"}>{companyName || "No company selected"}</span>
      </div> : null}
    </header>
    <span id="main-content-start" className="content-anchor" tabIndex={-1}/>
  </>;
}
