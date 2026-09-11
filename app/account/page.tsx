import Link from "next/link";
import { Building2, ShoppingBasket, ShoppingBag } from "lucide-react";
import { getCustomerContext } from "@/lib/magento/context";
import { requireCustomerToken } from "@/lib/session";

export const metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const token = await requireCustomerToken();
  const [ctx, messages] = await Promise.all([
    getCustomerContext(token),
    searchParams,
  ]);
  const selected = ctx.css_company_context.companies.find((company) => company.selected) || null;

  return <section className="account-workspace-content stack">
    <header className="account-workspace-heading">
      <div>
        <p className="eyebrow">Your account</p>
        <h1>Account overview</h1>
        <p className="muted">Manage your orders, repeat purchasing, approvals and returns from one place.</p>
      </div>
    </header>

    {messages.error ? <div className="error" role="alert">{messages.error}</div> : null}
    {messages.notice ? <div className="success" role="status">{messages.notice}</div> : null}

    <section className="card account-overview-company">
      <div className="account-overview-company-title">
        <span className="account-overview-icon"><Building2 size={20} aria-hidden="true"/></span>
        <div>
          <p className="account-card-kicker">Ordering company</p>
          <h2>{selected?.name || "No company selected"}</h2>
          {selected?.reference ? <p className="muted small">Account reference {selected.reference}</p> : null}
        </div>
      </div>
      <p className="muted">Product access, pricing and ordering permissions are based on the company shown here.</p>
    </section>

    <section className="account-overview-actions" aria-label="Quick actions">
      <Link className="card account-overview-action" href="/catalogue">
        <span className="account-overview-action-icon"><ShoppingBag size={21} aria-hidden="true"/></span>
        <div>
          <strong>Browse products</strong>
          <span>Start or continue an order.</span>
        </div>
      </Link>
      <Link className="card account-overview-action" href="/basket">
        <span className="account-overview-action-icon"><ShoppingBasket size={21} aria-hidden="true"/></span>
        <div>
          <strong>View basket</strong>
          <span>Review the items you’re currently ordering.</span>
        </div>
      </Link>
    </section>
  </section>;
}
