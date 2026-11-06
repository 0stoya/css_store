import Link from "next/link";
import { CatalogueBadgeProvider } from "@/components/catalogue-badges";
import { CataloguePagination } from "@/components/catalogue-pagination";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { EmployeePicker } from "@/components/employee-picker";
import { getActiveEmployees } from "@/lib/magento/employee";
import { getCustomerContext } from "@/lib/magento/context";
import { getEmployeeCatalogueMode, getSelectedEmployee } from "@/lib/employee-catalogue";
import { getEmployeeCataloguePolicy } from "@/lib/employee-catalogue-native";
import { selectEmployeeCatalogueAction, changeEmployeeCatalogueAction } from "./actions";
import { getCataloguePageContext } from "@/lib/magento/catalogue-page";
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
  searchParams: Promise<{ q?: string; page?: string; choose?: string; error?: string }>;
}) {
  const token = await requireCustomerToken();
  const { q = "", page: rawPage = "1", choose, error } = await searchParams;
  const page = Math.max(1, Math.trunc(Number(rawPage) || 1));
  const searchTerm = q.trim();

  // Global OFF or Magento Employees OFF: exact existing catalogue behaviour.
  // No css_app reads, cookies or Employee list queries are required.
  const mode = await getEmployeeCatalogueMode(token);
  const selectedEmployee = mode ? await getSelectedEmployee(mode) : null;
  if (mode && (!selectedEmployee || choose === "1")) {
    const [context, employees] = await Promise.all([
      getCustomerContext(token), getActiveEmployees(token),
    ]);
    const selectedCompany = context.css_company_context.companies.find((company) => company.selected);
    return <>
      <SiteHeader customerName={`${context.customer.firstname} ${context.customer.lastname}`.trim()}
        companyName={selectedCompany?.name}/>
      <main className="shell catalogue-page">
        <section className="card stack employee-catalogue-entry" aria-label="Select employee for purchasing">
          <p className="eyebrow">Employee purchasing</p>
          <h1>Who are you shopping for?</h1>
          <p className="muted employee-catalogue-entry-description">Select an active Employee before browsing their permitted catalogue. Your own checkout and approval permissions still apply.</p>
          {error ? <p className="error" role="alert">{error}</p> : null}
          {employees.length ? <form action={selectEmployeeCatalogueAction} className="stack employee-catalogue-entry-form">
            <EmployeePicker employees={employees} defaultSelectedId={selectedEmployee?.employeeId ?? null}/>
            <div><button className="button" type="submit">Shop for this Employee</button></div>
          </form> : <p className="error">No active Employees are available for purchasing.</p>}
        </section>
      </main>
    </>;
  }

  const policy = mode && selectedEmployee
    ? await getEmployeeCataloguePolicy(token, mode.companyId, selectedEmployee.employeeId)
    : null;
  // Unrestricted Catalogue Role inherits the manager's live Magento company
  // catalogue. No fake 279-SKU membership, empty Magento 'in' filter or
  // increase to the buyer's existing permission ceiling.
  const allowedSkus = policy?.catalogueScope === "COMPANY_INHERITED"
    ? null : policy?.skus ?? null;
  const catalogue = await getCataloguePageContext(
    token, searchTerm, page, 24, allowedSkus, policy !== null,
  );
  const { products, selectedCompany: selected, customerName: name, hidePrice } = catalogue;

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell catalogue-page">
      {mode && selectedEmployee ? <section className="card" aria-label="Selected Employee">
        <div className="row">
          <div><strong>Shopping for {selectedEmployee.name}</strong>
            <p className="muted small-text">Showing this Employee&apos;s permitted catalogue. Magento buyer permissions still apply.</p>
          </div>
          <form action={changeEmployeeCatalogueAction}>
            <button type="submit" className="button secondary">Change Employee</button>
          </form>
        </div>
      </section> : null}
      <header className="catalogue-page-heading">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>{searchTerm ? "Search results" : "Products"}</h1>
          <p className="catalogue-page-heading-meta">
            {searchTerm
              ? `${products.total_count} result${products.total_count === 1 ? "" : "s"} for “${searchTerm}”`
              : `${products.total_count} product${products.total_count === 1 ? "" : "s"}`}
          </p>
        </div>
        {searchTerm ? <Link className="button secondary" href="/catalogue">Clear search</Link> : null}
      </header>

      <CatalogueBadgeProvider skus={products.items.map((product) => product.sku)}>
        <section className="product-grid" aria-label={searchTerm ? `Search results for ${searchTerm}` : "Products"}>
          {products.items.map((product) => <ProductCard product={product} hidePrice={hidePrice} key={product.uid}/>)}
        </section>
      </CatalogueBadgeProvider>
      {!products.items.length ? <div className="empty card"><h2>No products found</h2><p className="muted">Try a different product name or SKU from the search in the header.</p>{searchTerm ? <p><Link className="button secondary" href="/catalogue">View all products</Link></p> : null}</div> : null}

      <CataloguePagination
        currentPage={products.page_info.current_page}
        totalPages={products.page_info.total_pages}
        href={(targetPage) => pageHref(targetPage, q)}
        label="Catalogue pages"
      />
    </main>
  </>;
}
