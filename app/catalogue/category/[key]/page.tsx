import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogueBadgeProvider } from "@/components/catalogue-badges";
import { CataloguePagination } from "@/components/catalogue-pagination";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCategoryPageContext } from "@/lib/magento/category-page";
import { requireCustomerToken } from "@/lib/session";

function pageHref(key: string, page: number) {
  const base = `/catalogue/category/${encodeURIComponent(key)}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const token = await requireCustomerToken();
  const [{ key: rawKey }, { page: rawPage = "1" }] = await Promise.all([params, searchParams]);
  const key = decodeURIComponent(rawKey);
  const page = Math.max(1, Math.trunc(Number(rawPage) || 1));
  const categoryPage = await getCategoryPageContext(token, key, page);
  const { category, products, selectedCompany: selected, customerName: name, hidePrice } = categoryPage;
  if (!category || !products) notFound();

  const routeKey = category.url_key || category.uid;

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell catalogue-page catalogue-category-page">
      <nav className="pdp-breadcrumb catalogue-category-breadcrumb" aria-label="Breadcrumb">
        <Link href="/catalogue">Products</Link><span aria-hidden="true">/</span><span>{category.name}</span>
      </nav>

      <header className="catalogue-category-header">
        <h1>{category.name}</h1>
        <p>{products.total_count} product{products.total_count === 1 ? "" : "s"}</p>
      </header>

      <CatalogueBadgeProvider skus={products.items.map((product) => product.sku)}>
        <section className="product-grid" aria-label={`${category.name} products`}>
          {products.items.map((product) => <ProductCard product={product} hidePrice={hidePrice} key={product.uid}/>)}
        </section>
      </CatalogueBadgeProvider>
      {!products.items.length ? <div className="empty card"><h2>No products found</h2><p className="muted">There are no products in this category at the moment.</p><p><Link className="button secondary" href="/catalogue">View all products</Link></p></div> : null}

      <CataloguePagination
        currentPage={products.page_info.current_page}
        totalPages={products.page_info.total_pages}
        href={(targetPage) => pageHref(routeKey, targetPage)}
        label={`${category.name} pages`}
      />
    </main>
  </>;
}
