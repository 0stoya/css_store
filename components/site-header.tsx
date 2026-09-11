import { ChevronDown, ChevronRight, ShoppingBasket, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getStoreName } from "@/lib/config";
import { getMenuCategories, type MenuCategory } from "@/lib/magento/menu-categories";
import { getCustomerToken } from "@/lib/session";

function categoryHref(category: Pick<MenuCategory, "uid" | "url_key">) {
  return `/catalogue/category/${encodeURIComponent(category.url_key || category.uid)}`;
}

function ProductCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return <small>{count} product{count === 1 ? "" : "s"}</small>;
}

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
        {customerName ? <details className="products-mega">
          <summary>
            <span>Products</span>
            <ChevronDown className="products-mega-chevron" size={15} strokeWidth={2.25} aria-hidden="true"/>
          </summary>
          <div className="mega-menu">
            <div className="mega-menu-heading">
              <div>
                <strong>Shop by category</strong>
                <span>Hover a category to browse deeper levels.</span>
              </div>
            </div>
            {categories.length ? <div className="mega-menu-cascade">
              <ul className="mega-menu-level mega-menu-level-root">
                {categories.map((category) => <li className="mega-menu-node mega-menu-node-root" key={category.uid}>
                  <Link className="mega-menu-entry mega-menu-entry-root" href={categoryHref(category)}>
                    <span>
                      <strong>{category.name}</strong>
                      <ProductCount count={category.product_count}/>
                    </span>
                    {category.children.length ? <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true"/> : null}
                  </Link>
                  {category.children.length ? <div className="mega-menu-level-panel mega-menu-level-panel-child">
                    <ul className="mega-menu-level mega-menu-level-child">
                      {category.children.map((child) => <li className="mega-menu-node mega-menu-node-child" key={child.uid}>
                        <Link className="mega-menu-entry mega-menu-entry-child" href={categoryHref(child)}>
                          <span>
                            <strong>{child.name}</strong>
                            <ProductCount count={child.product_count}/>
                          </span>
                          {child.children.length ? <ChevronRight size={16} strokeWidth={2.1} aria-hidden="true"/> : null}
                        </Link>
                        {child.children.length ? <div className="mega-menu-level-panel mega-menu-level-panel-grandchild">
                          <ul className="mega-menu-level mega-menu-level-grandchild">
                            {child.children.map((grandchild) => <li className="mega-menu-node" key={grandchild.uid}>
                              <Link className="mega-menu-entry mega-menu-entry-grandchild" href={categoryHref(grandchild)}>
                                <span>
                                  <strong>{grandchild.name}</strong>
                                  <ProductCount count={grandchild.product_count}/>
                                </span>
                              </Link>
                            </li>)}
                          </ul>
                        </div> : null}
                      </li>)}
                    </ul>
                  </div> : null}
                </li>)}
              </ul>
            </div> : <p className="mega-menu-empty">No product categories are currently available in the store menu.</p>}
          </div>
        </details> : <Link href="/catalogue">Products</Link>}
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
