import Link from "next/link";
import { CatalogueBadgeProvider } from "@/components/catalogue-badges";
import { CataloguePagination } from "@/components/catalogue-pagination";
import { HomeCategorySection } from "@/components/home-category-section";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCataloguePageContext } from "@/lib/magento/catalogue-page";
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

  const catalogue = await getCataloguePageContext(token, searchTerm, page);
  const { products, selectedCompany: selected, customerName: name, hidePrice } = catalogue;

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell catalogue-page home-catalogue-page">
      {!searchTerm ? <HomeCategorySection scopeKey={selected?.name || "customer"}/> : null}

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

        <CatalogueBadgeProvider skus={products.items.map((product) => product.sku)}>
          <div className="product-grid" aria-label={searchTerm ? `Search results for ${searchTerm}` : "Products"}>
            {products.items.map((product) => <ProductCard product={product} hidePrice={hidePrice} key={product.uid}/>)}
          </div>
        </CatalogueBadgeProvider>
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
