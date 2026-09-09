import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";

export default async function HomePage() {
  const token = await requireCustomerToken();
  const ctx = await getCustomerContext(token);
  const selected = ctx.css_company_context.companies.find((c) => c.selected) || null;
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  return <><SiteHeader customerName={name} companyName={selected?.name}/><main className="shell"><section className="hero"><div className="panel hero-main"><p className="eyebrow">Company purchasing</p><h1>Safety supplies, priced for your company.</h1><p className="muted">Your storefront is driven by the selected Fluid company context, catalogue permissions, OGL pricing and Magento stock.</p><p><Link className="button" href="/catalogue">Browse products</Link></p></div><aside className="panel hero-side"><span className="badge">{selected?.reference || "Customer"}</span><h2>{selected?.name || "No company selected"}</h2><p className="muted">{ctx.css_ordering_capabilities.company_context ? "Company ordering context is active." : "No company ordering context is available."}</p><Link className="button secondary" href="/account">Account & company</Link></aside></section></main></>;
}
