import { Search, Settings, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BasketNavLink } from "@/components/basket-nav-link";
import { CatalogueSearch } from "@/components/catalogue-search";
import { ProductMegaMenu } from "@/components/product-mega-menu";
import { getAdminPortalUrl, getStoreName } from "@/lib/config";
import type { MenuCategory } from "@/lib/magento/menu-categories";

export function SiteHeader({
  customerName,
  companyName,
  basketQuantity,
  menuCategories,
}: {
  customerName?: string;
  companyName?: string | null;
  basketQuantity?: number;
  menuCategories?: MenuCategory[];
}) {
  return <>
    <header className="site-header">
      <a className="skip-link" href="#main-content-start">Skip to main content</a>
      <Link className="brand" href="/" aria-label={`${getStoreName()} home`}>
        <Image src="/css-logo.png" alt="" width={320} height={86} priority />
        <span className="sr-only">{getStoreName()}</span>
      </Link>
      <nav aria-label="Store navigation" className="store-nav">
        {customerName ? <Link className="store-nav-link store-nav-all-products" href="/catalogue">All products</Link> : null}
        {customerName ? <ProductMegaMenu key={companyName || "customer"} scopeKey={companyName || "customer"} initialCategories={menuCategories}/> : <Link href="/catalogue">Products</Link>}
        {customerName ? <Link
          className="store-nav-link store-nav-search-mobile"
          href="/catalogue?focus=search"
          aria-label="Search products"
          title="Search products"
        >
          <Search size={17} strokeWidth={2.1} aria-hidden="true"/>
        </Link> : null}
        {customerName ? <BasketNavLink initialQuantity={basketQuantity}/> : null}
        {customerName ? <a className="store-nav-link" href={`${getAdminPortalUrl()}/api/auth/sso/start`}>
          <Settings size={16} strokeWidth={2.1} aria-hidden="true"/>
          <span>Manage</span>
        </a> : null}
        {customerName ? <Link className="store-nav-link" href="/account">
          <UserRound size={16} strokeWidth={2.1} aria-hidden="true"/>
          <span>Account</span>
        </Link> : <Link href="/login">Sign in</Link>}
      </nav>
      {customerName ? <div className="header-product-search">
        <CatalogueSearch variant="header" placeholder="Search products"/>
      </div> : <span/>}
    </header>
    <span id="main-content-start" className="content-anchor" tabIndex={-1}/>
  </>;
}
