import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCategories, getProducts } from "@/lib/magento/catalogue";
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
  const [ctx, categories, products] = await Promise.all([
    getCustomerContext(token),
    getCategories(token),
    getProducts(token, q.trim(), page),
  ]);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Company catalogue</p>
          <h1>Products</h1>
          <p className="muted">{products.total_count} products visible for the current Magento / Fluid company context.</p>
        </div>
        <form className="search">
          <input name="q" type="search" defaultValue={q} placeholder="Search products"/>
          <button className="button secondary" type="submit">Search</button>
        </form>
      </div>

      {categories.length ? <nav className="category-grid" aria-label="Product categories">
        {categories.map((category) => <Link className="category-card card" href={`/catalogue/category/${encodeURIComponent(category.url_key || category.uid)}`} key={category.uid}>
          {category.image_url ? <img src={category.image_url} alt=""/> : null}
          <span><strong>{category.name}</strong><small>{category.product_count} products</small></span>
        </Link>)}
      </nav> : null}

      <section className="product-grid">
        {products.items.map((product) => <ProductCard product={product} hidePrice={ctx.css_storefront_policy.hide_price} key={product.uid}/>)}
      </section>
      {!products.items.length ? <div className="empty card"><h2>No products found</h2><p className="muted">Try another search term or browse a category.</p></div> : null}

      {products.page_info.total_pages > 1 ? <nav className="pagination" aria-label="Catalogue pages">
        {products.page_info.current_page > 1 ? <Link className="button secondary" href={pageHref(products.page_info.current_page - 1, q)}>Previous</Link> : <span/>}
        <span>Page {products.page_info.current_page} of {products.page_info.total_pages}</span>
        {products.page_info.current_page < products.page_info.total_pages ? <Link className="button secondary" href={pageHref(products.page_info.current_page + 1, q)}>Next</Link> : <span/>}
      </nav> : null}
    </main>
  </>;
}
