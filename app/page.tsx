import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";

export default async function HomePage() {
  const token = await requireCustomerToken();
  const ctx = await getCustomerContext(token);
  const selected = ctx.css_company_context.companies.find((c) => c.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell">
      <section className="hero">
        <div className="panel hero-main">
          <p className="eyebrow">Business purchasing</p>
          <h1>Safety supplies, ready for your business.</h1>
          <p className="muted">Browse your approved product range with your company pricing, stock availability and ordering rules already applied.</p>
          <p><Link className="button" href="/catalogue">Browse products</Link></p>
        </div>
        <aside className="panel hero-side">
          <span className="badge">Ordering for</span>
          <h2>{selected?.name || "No company selected"}</h2>
          <p className="muted">{ctx.css_ordering_capabilities.company_context
            ? "Your company account is ready to use."
            : "Choose a company from your account before placing an order."}</p>
          <Link className="button secondary" href="/account">Account & company</Link>
        </aside>
      </section>
    </main>
  </>;
}
