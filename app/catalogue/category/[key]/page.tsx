import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogueSearch } from "@/components/catalogue-search";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCategories, getProducts } from "@/lib/magento/catalogue";
import { getCustomerContext } from "@/lib/magento/context";
import { getMenuCategories, type MenuCategory } from "@/lib/magento/menu-categories";
import { requireCustomerToken } from "@/lib/session";

function pageHref(key: string, page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  const base = `/catalogue/category/${encodeURIComponent(key)}`;
  return query ? `${base}?${query}` : base;
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
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const token = await requireCustomerToken();
  const [{ key: rawKey }, { q = "", page: rawPage = "1" }] = await Promise.all([params, searchParams]);
  const key = decodeURIComponent(rawKey);
  const page = Math.max(1, Math.trunc(Number(rawPage) || 1));
  const searchTerm = q.trim();
  const [ctx, categories, menuCategories] = await Promise.all([
    getCustomerContext(token),
    getCategories(token),
    getMenuCategories(token),
  ]);
  const category = categories.find((item) => item.url_key === key || item.uid === key)
    || findMenuCategory(menuCategories, key);
  if (!category) notFound();

  const products = await getProducts(token, searchTerm, page, 24, category.uid);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const routeKey = category.url_key || category.uid;
  const categoryPath = `/catalogue/category/${encodeURIComponent(routeKey)}`;

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell catalogue-page catalogue-category-page">
      <nav className="pdp-breadcrumb catalogue-category-breadcrumb" aria-label="Breadcrumb">
        <Link href="/catalogue">Products</Link><span aria-hidden="true">/</span><span>{category.name}</span>
      </nav>

      <header className="catalogue-hero catalogue-category-hero">
        <div className="catalogue-hero-heading">
          <h1>{category.name}</h1>
          <p className="catalogue-category-count">
            {searchTerm
              ? `${products.total_count} result${products.total_count === 1 ? "" : "s"} for “${searchTerm}”`
              : `${products.total_count} product${products.total_count === 1 ? "" : "s"}`}
          </p>
        </div>
        <CatalogueSearch
          action={categoryPath}
          categoryUid={category.uid}
          defaultValue={q}
          placeholder={`Search ${category.name} by name or SKU`}
        />
      </header>

      {searchTerm ? <div className="catalogue-category-search-actions">
        <Link className="button secondary" href={categoryPath}>Clear search</Link>
      </div> : null}

      <section className="product-grid" aria-label={`${category.name} products`}>
        {products.items.map((product) => <ProductCard product={product} hidePrice={ctx.css_storefront_policy.hide_price} key={product.uid}/>)}
      </section>
      {!products.items.length ? <div className="empty card"><h2>No products found</h2><p className="muted">Try a different search term or return to all products.</p><p><Link className="button secondary" href="/catalogue">View all products</Link></p></div> : null}

      {products.page_info.total_pages > 1 ? <nav className="pagination" aria-label={`${category.name} pages`}>
        {products.page_info.current_page > 1 ? <Link className="button secondary" href={pageHref(routeKey, products.page_info.current_page - 1, q)}>Previous</Link> : <span/>}
        <span>Page {products.page_info.current_page} of {products.page_info.total_pages}</span>
        {products.page_info.current_page < products.page_info.total_pages ? <Link className="button secondary" href={pageHref(routeKey, products.page_info.current_page + 1, q)}>Next</Link> : <span/>}
      </nav> : null}
    </main>
  </>;
}
