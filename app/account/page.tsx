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
      <section className="card account-hero">
        <div>
          <p className="eyebrow">Your account</p>
          <h1>{name}</h1>
          <p className="muted">{ctx.customer.email}</p>
        </div>
        {selected ? <div className="identity">
          <strong>{selected.name}</strong>
          <span>{selected.reference || "Current ordering company"}</span>
        </div> : null}
      </section>

      {messages.error ? <div className="error" role="alert">{messages.error}</div> : null}
      {messages.notice ? <div className="success" role="status">{messages.notice}</div> : null}

      <section className="account-grid">
        <article className="card account-company-card">
          <p className="account-card-kicker">Company</p>
          <h2>Ordering company</h2>
          <p className="muted">Choose the company you are ordering for. Products, prices and ordering permissions will update automatically.</p>
          <div className="company-list">
            {ctx.css_company_context.companies.filter((company) => company.active).map((company) => <div className={`company-row ${company.selected ? "current" : ""}`} key={company.company_id}>
              <div>
                <strong>{company.name || `Company ${company.company_id}`}</strong>
                <div className="muted small">{company.reference || `#${company.company_id}`}</div>
              </div>
              {company.selected
                ? <span className="badge">Current company</span>
                : <form action={selectCompanyAction}>
                    <input type="hidden" name="companyId" value={company.company_id}/>
                    <button className="button secondary" type="submit">Use company</button>
                  </form>}
            </div>)}
          </div>
        </article>

        <article className="card">
          <p className="account-card-kicker">Orders</p>
          <h2>Order history</h2>
          <p className="muted">View previous orders for the selected company, including product options and Employee details where applicable.</p>
          <Link className="button" href="/account/orders">View order history</Link>
        </article>

        <article className="card">
          <p className="account-card-kicker">Reorder</p>
          <h2>Repeat orders</h2>
          <p className="muted">Manage saved repeat lists or reorder eligible items from previous orders.</p>
          <Link className="button" href="/account/repeat-orders">Manage repeat orders</Link>
        </article>

        <article className="card">
          <p className="account-card-kicker">Approvals</p>
          <h2>Credit orders</h2>
          <p className="muted">View credit orders, approval requests and the actions available to your account.</p>
          <Link className="button" href="/account/credit-orders">View credit orders</Link>
        </article>

        <article className="card">
          <p className="account-card-kicker">Support</p>
          <h2>Returns</h2>
          <p className="muted">Send a return request to our team and include an order number when relevant.</p>
          <Link className="button" href="/account/returns">Request a return</Link>
        </article>

        <article className="card">
          <p className="account-card-kicker">Security</p>
          <h2>Account access</h2>
          <p className="muted">Signed in as {ctx.customer.email}.</p>
          <form action={logoutAction}><button className="button secondary" type="submit">Sign out</button></form>
        </article>
      </section>
    </main>
  </>;
}
