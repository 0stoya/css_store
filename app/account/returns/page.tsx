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
      <div className="basket-heading">
        <div>
          <p className="eyebrow">Customer account · returns</p>
          <h1>Request a return</h1>
          <p className="muted">Send a return enquiry to the configured Chelmsford Safety Supplies returns workflow.</p>
        </div>
        <Link className="button secondary" href="/account">Back to account</Link>
      </div>

      {params.error ? <p className="error" role="alert">{params.error}</p> : null}
      {params.notice ? <p className="success" role="status">{params.notice}</p> : null}

      {!configuration.enabled ? <section className="empty card">
        <h2>Returns requests are currently unavailable</h2>
        <p className="muted">The returns request service is disabled for this storefront. Please contact us through the normal customer-service channel.</p>
      </section> : !configuration.authenticated ? <section className="empty card">
        <h2>Sign in required</h2>
        <p className="muted">Return requests can only be submitted by an authenticated customer.</p>
      </section> : <section className="card stack" style={{padding:24}}>
        <div>
          <h2>Return request details</h2>
          <p className="muted small">This submits a contact/request record through Fluid and the existing Css_Returns queue. It does not create an RMA or provide return-status history.</p>
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
            <span>Message</span>
            <textarea name="message" rows={7} required/>
          </label>

          <div>
            <button className="button" type="submit">Submit return request</button>
          </div>
        </form>
      </section>}
    </main>
  </>;
}
