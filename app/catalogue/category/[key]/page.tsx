import Link from "next/link";
import { notFound } from "next/navigation";
import { CataloguePagination } from "@/components/catalogue-pagination";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCategories, getProducts } from "@/lib/magento/catalogue";
import { getCustomerContext } from "@/lib/magento/context";
import { getMenuCategories, type MenuCategory } from "@/lib/magento/menu-categories";
import { requireCustomerToken } from "@/lib/session";

function pageHref(key: string, page: number) {
  const base = `/catalogue/category/${encodeURIComponent(key)}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

function findMenuCategory(categories: MenuCategory[], key: string): MenuCategory | null {
  for (const category of categories) {
    if (category.url_key === key || category.uid === key) return category;
    const childMatch = findMenuCategory(category.children, key);
    if (childMatch) return childMatch;
  }
  return null;
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
  const [ctx, categories, menuCategories] = await Promise.all([
    getCustomerContext(token),
    getCategories(token),
    getMenuCategories(token),
  ]);
  const category = categories.find((item) => item.url_key === key || item.uid === key)
    || findMenuCategory(menuCategories, key);
  if (!category) notFound();

  const products = await getProducts(token, "", page, 24, category.uid);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
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

      <section className="product-grid" aria-label={`${category.name} products`}>
        {products.items.map((product) => <ProductCard product={product} hidePrice={ctx.css_storefront_policy.hide_price} key={product.uid}/>)}
      </section>
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
