import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CataloguePagination } from "@/components/catalogue-pagination";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getProducts } from "@/lib/magento/catalogue";
import { getCustomerContext } from "@/lib/magento/context";
import { getMenuCategories } from "@/lib/magento/menu-categories";
import { requireCustomerToken } from "@/lib/session";

function pageHref(page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const token = await requireCustomerToken();
  const { q = "", page: rawPage = "1" } = await searchParams;
  const page = Math.max(1, Math.trunc(Number(rawPage) || 1));
  const searchTerm = q.trim();

  const [ctx, products, menuCategories] = await Promise.all([
    getCustomerContext(token),
    getProducts(token, searchTerm, page),
    getMenuCategories(token).catch(() => []),
  ]);

  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const featuredCategories = menuCategories.slice(0, 8);

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell catalogue-page home-catalogue-page">
      {!searchTerm && featuredCategories.length ? <section className="home-category-section" aria-labelledby="home-category-heading">
        <div className="home-section-heading">
          <h1 id="home-category-heading">Shop by category</h1>
          <Link href="/catalogue">View all products</Link>
        </div>
        <div className="home-category-grid">
          {featuredCategories.map((category) => <Link
            className="home-category-link"
            href={`/catalogue/category/${encodeURIComponent(category.url_key || category.uid)}`}
            key={category.uid}
          >
            <span>
              <strong>{category.name}</strong>
              {category.product_count > 0 ? <small>{category.product_count} product{category.product_count === 1 ? "" : "s"}</small> : null}
            </span>
            <ChevronRight size={17} strokeWidth={2.1} aria-hidden="true"/>
          </Link>)}
        </div>
      </section> : null}

      <section className="home-products-section" aria-labelledby="home-products-heading">
        <div className="portal-section-heading catalogue-products-heading home-products-heading">
          <div>
            <h2 id="home-products-heading">{searchTerm ? "Search results" : "Products"}</h2>
            <p>{searchTerm
              ? `${products.total_count} result${products.total_count === 1 ? "" : "s"} for “${searchTerm}”`
              : `${products.total_count} product${products.total_count === 1 ? "" : "s"}`}</p>
          </div>
          {searchTerm ? <Link className="button secondary" href="/">Clear search</Link> : null}
        </div>

        <div className="product-grid" aria-label={searchTerm ? `Search results for ${searchTerm}` : "Products"}>
          {products.items.map((product) => <ProductCard product={product} hidePrice={ctx.css_storefront_policy.hide_price} key={product.uid}/>)}
        </div>
        {!products.items.length ? <div className="empty card">
          <h2>No products found</h2>
          <p className="muted">Try a different product name or SKU from the search in the header.</p>
          {searchTerm ? <p><Link className="button secondary" href="/">View all products</Link></p> : null}
        </div> : null}

        <CataloguePagination
          currentPage={products.page_info.current_page}
          totalPages={products.page_info.total_pages}
          href={(targetPage) => pageHref(targetPage, q)}
          label="Product pages"
        />
      </section>
    </main>
  </>;
}
