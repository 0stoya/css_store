import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCategories, getProducts } from "@/lib/magento/catalogue";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";

function pageHref(key: string, page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  const base = `/catalogue/category/${encodeURIComponent(key)}`;
  return query ? `${base}?${query}` : base;
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
  const [ctx, categories] = await Promise.all([getCustomerContext(token), getCategories(token)]);
  const category = categories.find((item) => item.url_key === key || item.uid === key);
  if (!category) notFound();

  const products = await getProducts(token, q.trim(), page, 24, category.uid);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const routeKey = category.url_key || category.uid;

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell">
      <Link className="back-link" href="/catalogue">← All products</Link>
      <div className="toolbar">
        <div>
          <p className="eyebrow">Category</p>
          <h1>{category.name}</h1>
          <p className="muted">{products.total_count} products visible in this company-scoped category.</p>
        </div>
        <form className="search">
          <input name="q" type="search" defaultValue={q} placeholder={`Search ${category.name}`}/>
          <button className="button secondary" type="submit">Search</button>
        </form>
      </div>

      <section className="product-grid">
        {products.items.map((product) => <ProductCard product={product} hidePrice={ctx.css_storefront_policy.hide_price} key={product.uid}/>)}
      </section>
      {!products.items.length ? <div className="empty card"><h2>No products found</h2><p className="muted">Try another search term or return to all products.</p></div> : null}

      {products.page_info.total_pages > 1 ? <nav className="pagination" aria-label={`${category.name} pages`}>
        {products.page_info.current_page > 1 ? <Link className="button secondary" href={pageHref(routeKey, products.page_info.current_page - 1, q)}>Previous</Link> : <span/>}
        <span>Page {products.page_info.current_page} of {products.page_info.total_pages}</span>
        {products.page_info.current_page < products.page_info.total_pages ? <Link className="button secondary" href={pageHref(routeKey, products.page_info.current_page + 1, q)}>Next</Link> : <span/>}
      </nav> : null}
    </main>
  </>;
}
