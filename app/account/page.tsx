import Link from "next/link";
import {
  Building2,
  ChevronRight,
  ClipboardCheck,
  LogOut,
  Mail,
  PackageSearch,
  Repeat2,
  RotateCcw,
  UserRound,
} from "lucide-react";
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
  const activeCompanies = ctx.css_company_context.companies.filter((company) => company.active);
  const name = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const messages = await searchParams;

  const accountLinks = [
    {
      href: "/account/orders",
      eyebrow: "Orders",
      title: "Order history",
      description: "Review previous orders, product options and Employee assignments.",
      Icon: PackageSearch,
    },
    {
      href: "/account/repeat-orders",
      eyebrow: "Reorder",
      title: "Repeat orders",
      description: "Manage saved repeat lists and reorder products you buy regularly.",
      Icon: Repeat2,
    },
    {
      href: "/account/credit-orders",
      eyebrow: "Approvals",
      title: "Credit orders",
      description: "View submitted credit orders and any approval activity available to you.",
      Icon: ClipboardCheck,
    },
    {
      href: "/account/returns",
      eyebrow: "Support",
      title: "Returns",
      description: "Request a return and reference an order when relevant.",
      Icon: RotateCcw,
    },
  ];

  return <>
    <SiteHeader customerName={name} companyName={selected?.name}/>
    <main className="shell stack account-page">
      <section className="card account-profile-card">
        <div className="account-profile-main">
          <span className="account-profile-icon"><UserRound size={24} aria-hidden="true"/></span>
          <div>
            <p className="eyebrow">Your account</p>
            <h1>{name}</h1>
            <p className="account-email"><Mail size={15} aria-hidden="true"/><span>{ctx.customer.email}</span></p>
          </div>
        </div>

        {selected ? <div className="account-company-summary">
          <span className="account-company-icon"><Building2 size={19} aria-hidden="true"/></span>
          <div>
            <span>Ordering as</span>
            <strong>{selected.name}</strong>
            {selected.reference ? <small>{selected.reference}</small> : null}
          </div>
        </div> : null}
      </section>

      {messages.error ? <div className="error" role="alert">{messages.error}</div> : null}
      {messages.notice ? <div className="success" role="status">{messages.notice}</div> : null}

      {activeCompanies.length > 1 ? <section className="card account-company-switcher">
        <div className="account-section-heading">
          <div>
            <p className="account-card-kicker">Company</p>
            <h2>Ordering company</h2>
          </div>
          <p>Switch the company you are ordering for. Product access and pricing update automatically.</p>
        </div>

        <div className="company-list account-company-list">
          {activeCompanies.map((company) => <div className={`company-row ${company.selected ? "current" : ""}`} key={company.company_id}>
            <div className="account-company-row-copy">
              <span className="account-company-row-icon"><Building2 size={17} aria-hidden="true"/></span>
              <div>
                <strong>{company.name || `Company ${company.company_id}`}</strong>
                <div className="muted small">{company.reference || `#${company.company_id}`}</div>
              </div>
            </div>
            {company.selected
              ? <span className="badge account-current-company">Current</span>
              : <form action={selectCompanyAction}>
                  <input type="hidden" name="companyId" value={company.company_id}/>
                  <button className="button secondary" type="submit">Use company</button>
                </form>}
          </div>)}
        </div>
      </section> : null}

      <section className="account-navigation" aria-labelledby="account-tools-heading">
        <div className="account-navigation-heading">
          <div>
            <p className="eyebrow">Account tools</p>
            <h2 id="account-tools-heading">Manage your account</h2>
          </div>
          <p>Orders, repeat purchasing, approvals and returns.</p>
        </div>

        <div className="account-navigation-grid">
          {accountLinks.map(({ href, eyebrow, title, description, Icon }) => <Link className="card account-nav-card" href={href} key={href}>
            <span className="account-nav-icon"><Icon size={22} aria-hidden="true"/></span>
            <div className="account-nav-copy">
              <span className="account-nav-eyebrow">{eyebrow}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
            <span className="account-nav-arrow" aria-hidden="true"><ChevronRight size={20}/></span>
          </Link>)}
        </div>
      </section>

      <section className="card account-session-card">
        <div className="account-session-copy">
          <span className="account-session-icon"><UserRound size={18} aria-hidden="true"/></span>
          <div>
            <strong>Account access</strong>
            <span>Signed in as {ctx.customer.email}</span>
          </div>
        </div>
        <form action={logoutAction}>
          <button className="button secondary account-signout-button" type="submit">
            <LogOut size={16} aria-hidden="true"/>
            <span>Sign out</span>
          </button>
        </form>
      </section>
    </main>
  </>;
}
