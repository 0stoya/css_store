import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";
import { logoutAction, selectCompanyAction } from "@/app/actions";

export const metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const token = await requireCustomerToken();
  const ctx = await getCustomerContext(token);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const messages = await searchParams;

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell stack">
      <div>
        <p className="eyebrow">Customer account</p>
        <h1 style={{fontSize:"2.6rem"}}>{name}</h1>
        <p className="muted">{ctx.customer.email}</p>
      </div>

      {messages.error ? <div className="error">{messages.error}</div> : null}
      {messages.notice ? <div className="card" style={{padding:14}}>{messages.notice}</div> : null}

      <section className="account-grid">
        <article className="card">
          <h2>Company context</h2>
          <p className="muted">Select the company whose catalogue, pricing and ordering rules should apply.</p>
          <div className="company-list">
            {ctx.css_company_context.companies.filter((company) => company.active).map((company) => <div className={`company-row ${company.selected ? "current" : ""}`} key={company.company_id}>
              <div>
                <strong>{company.name || `Company ${company.company_id}`}</strong>
                <div className="muted">{company.reference || `#${company.company_id}`}</div>
              </div>
              {company.selected
                ? <span className="badge">Selected</span>
                : <form action={selectCompanyAction}>
                    <input type="hidden" name="companyId" value={company.company_id}/>
                    <button className="button secondary" type="submit">Use company</button>
                  </form>}
            </div>)}
          </div>
        </article>

        <article className="card">
          <h2>Orders</h2>
          <p className="muted">View Magento sales orders allowed by Fluid for the currently selected company.</p>
          <p><span className="badge">{ctx.css_ordering_capabilities.company_active ? "Company active" : "Company inactive"}</span></p>
          <Link className="button" href="/account/orders">View order history</Link>
        </article>

        <article className="card">
          <h2>Repeat orders</h2>
          <p className="muted">Manage saved repeat lists and rebuild previous grouped-configurable selections through Fluid’s current compatibility checks.</p>
          <Link className="button" href="/account/repeat-orders">Manage repeat orders</Link>
        </article>

        <article className="card">
          <h2>Credit orders</h2>
          <p className="muted">View your Fluid credit orders and any company or approval queues your current role is authorised to access.</p>
          <Link className="button" href="/account/credit-orders">View credit orders</Link>
        </article>

        <article className="card">
          <h2>Returns</h2>
          <p className="muted">Submit an authenticated return enquiry through the existing Fluid/Css_Returns request workflow.</p>
          <Link className="button" href="/account/returns">Request a return</Link>
        </article>

        <article className="card">
          <h2>Ordering capabilities</h2>
          <p className="muted">Storefront policy: prices {ctx.css_storefront_policy.hide_price ? "hidden" : "visible"}; add to cart {ctx.css_storefront_policy.hide_add_to_cart ? "hidden" : "available"}.</p>
          <form action={logoutAction}><button className="button secondary" type="submit">Sign out</button></form>
        </article>
      </section>
    </main>
  </>;
}
