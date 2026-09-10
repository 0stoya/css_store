import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getProducts } from "@/lib/magento/catalogue";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";

export const metadata = { title: "Products" };

function pageHref(page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/catalogue?${query}` : "/catalogue";
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const token = await requireCustomerToken();
  const { q = "", page: rawPage = "1" } = await searchParams;
  const page = Math.max(1, Math.trunc(Number(rawPage) || 1));
  const searchTerm = q.trim();
  const [ctx, products] = await Promise.all([
    getCustomerContext(token),
    getProducts(token, searchTerm, page),
  ]);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell">
      <header className="portal-page-header">
        <div className="portal-page-heading">
          <p className="eyebrow">Catalogue</p>
          <h1>Products</h1>
          <p className="muted">
            Browse products available to {selected?.name || "your company"}. Your prices and availability are shown automatically.
          </p>
          {searchTerm ? <p className="catalogue-result-note">{products.total_count} result{products.total_count === 1 ? "" : "s"} for “{searchTerm}”.</p> : null}
        </div>
        <form className="catalogue-search" role="search">
          <label className="sr-only" htmlFor="catalogue-search">Search products</label>
          <input id="catalogue-search" name="q" type="search" defaultValue={q} placeholder="Search by product name or SKU"/>
          <button className="button secondary" type="submit">Search</button>
        </form>
      </header>

      <div className="portal-section-heading catalogue-products-heading">
        <div>
          <h2>{searchTerm ? "Search results" : "All products"}</h2>
          <p>{products.total_count} product{products.total_count === 1 ? "" : "s"}</p>
        </div>
        {searchTerm ? <Link className="button secondary" href="/catalogue">Clear search</Link> : null}
      </div>

      <section className="product-grid" aria-label={searchTerm ? `Search results for ${searchTerm}` : "Products"}>
        {products.items.map((product) => <ProductCard product={product} hidePrice={ctx.css_storefront_policy.hide_price} key={product.uid}/>)}
      </section>
      {!products.items.length ? <div className="empty card"><h2>No products found</h2><p className="muted">Try a different search term or choose a category from the Products menu.</p>{searchTerm ? <p><Link className="button secondary" href="/catalogue">View all products</Link></p> : null}</div> : null}

      {products.page_info.total_pages > 1 ? <nav className="pagination" aria-label="Catalogue pages">
        {products.page_info.current_page > 1 ? <Link className="button secondary" href={pageHref(products.page_info.current_page - 1, q)}>Previous</Link> : <span/>}
        <span>Page {products.page_info.current_page} of {products.page_info.total_pages}</span>
        {products.page_info.current_page < products.page_info.total_pages ? <Link className="button secondary" href={pageHref(products.page_info.current_page + 1, q)}>Next</Link> : <span/>}
      </nav> : null}
    </main>
  </>;
}
