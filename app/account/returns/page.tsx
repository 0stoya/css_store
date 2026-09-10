import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { getReturnsConfiguration } from "@/lib/magento/returns";
import { requireCustomerToken } from "@/lib/session";
import { submitReturnRequestAction } from "./actions";

export const metadata = { title: "Returns" };

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; order?: string }>;
}) {
  const token = await requireCustomerToken();
  const [ctx, configuration, params] = await Promise.all([
    getCustomerContext(token),
    getReturnsConfiguration(token),
    searchParams,
  ]);
  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const order = String(params.order || "").trim();

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell stack">
      <header className="portal-page-header">
        <div className="portal-page-heading">
          <p className="eyebrow">Account</p>
          <h1>Request a return</h1>
          <p className="muted">Send the details to our returns team. Add the order number if you have it.</p>
        </div>
        <Link className="button secondary" href="/account">Back to account</Link>
      </header>

      {params.error ? <p className="error" role="alert">{params.error}</p> : null}
      {params.notice ? <p className="success" role="status">{params.notice}</p> : null}

      {!configuration.enabled ? <section className="empty card">
        <h2>Return requests are currently unavailable</h2>
        <p className="muted">Please contact our customer service team for help with a return.</p>
      </section> : !configuration.authenticated ? <section className="empty card">
        <h2>Sign in required</h2>
        <p className="muted">Please sign in before submitting a return request.</p>
      </section> : <section className="card stack" style={{padding:24}}>
        <div className="checkout-card-intro">
          <h2>Return details</h2>
          <p>Tell us what you need to return and why. Our team will review your request and follow up with you.</p>
        </div>

        <form action={submitReturnRequestAction} className="stack">
          <label className="field">
            <span>Order number <span className="muted">(optional)</span></span>
            <input name="order" defaultValue={order} autoComplete="off"/>
          </label>

          <label className="field">
            <span>Email address</span>
            <input name="email" type="email" defaultValue={ctx.customer.email} required autoComplete="email"/>
          </label>

          <label className="field">
            <span>Telephone</span>
            <input name="telephone" type="tel" required autoComplete="tel"/>
          </label>

          <label className="field">
            <span>What would you like to return?</span>
            <textarea name="message" rows={7} required placeholder="Include the product, quantity and reason for the return."/>
          </label>

          <div>
            <button className="button" type="submit">Send return request</button>
          </div>
        </form>
      </section>}
    </main>
  </>;
}
