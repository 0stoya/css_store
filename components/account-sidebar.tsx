import Link from "next/link";
import {
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  Repeat2,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { logoutAction, selectCompanyAction } from "@/app/actions";
import type { CompanySummary } from "@/lib/magento/context";

export type AccountSection = "overview" | "orders" | "repeat-orders" | "credit-orders" | "returns";

type AccountSidebarProps = {
  name: string;
  email: string;
  companies: CompanySummary[];
  active: AccountSection;
};

const links: Array<{
  section: AccountSection;
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
}> = [
  { section: "overview", href: "/account", label: "Overview", Icon: LayoutDashboard },
  { section: "orders", href: "/account/orders", label: "Order history", Icon: PackageSearch },
  { section: "repeat-orders", href: "/account/repeat-orders", label: "Repeat orders", Icon: Repeat2 },
  { section: "credit-orders", href: "/account/credit-orders", label: "Credit orders", Icon: ClipboardCheck },
  { section: "returns", href: "/account/returns", label: "Returns", Icon: RotateCcw },
];

export function AccountSidebar({ name, email, companies, active }: AccountSidebarProps) {
  const activeCompanies = companies.filter((company) => company.active);
  const selected = activeCompanies.find((company) => company.selected) || null;

  return <aside className="account-sidebar card" aria-label="Account navigation">
    <div className="account-sidebar-profile">
      <span className="account-sidebar-avatar"><UserRound size={20} aria-hidden="true"/></span>
      <div>
        <strong>{name}</strong>
        <span>{email}</span>
      </div>
    </div>

    <nav className="account-sidebar-nav" aria-label="Account sections">
      {links.map(({ section, href, label, Icon }) => {
        const isActive = section === active;
        return <Link
          className={`account-sidebar-link ${isActive ? "active" : ""}`}
          href={href}
          key={href}
          aria-current={isActive ? "page" : undefined}
        >
          <Icon size={18} aria-hidden="true"/>
          <span>{label}</span>
        </Link>;
      })}
    </nav>

    <div className="account-sidebar-divider"/>

    <section className="account-sidebar-company" aria-label="Ordering company">
      <span className="account-sidebar-company-icon"><Building2 size={17} aria-hidden="true"/></span>
      <div>
        <span>Ordering company</span>
        <strong>{selected?.name || "No company selected"}</strong>
        {selected?.reference ? <small>{selected.reference}</small> : null}
      </div>
    </section>

    {activeCompanies.length > 1 ? <details className="account-sidebar-switcher">
      <summary>Switch company</summary>
      <div className="account-sidebar-company-list">
        {activeCompanies.map((company) => <div className={`account-sidebar-company-option ${company.selected ? "current" : ""}`} key={company.company_id}>
          <div>
            <strong>{company.name || `Company ${company.company_id}`}</strong>
            <span>{company.reference || `#${company.company_id}`}</span>
          </div>
          {company.selected ? <span className="badge">Current</span> : <form action={selectCompanyAction}>
            <input type="hidden" name="companyId" value={company.company_id}/>
            <button className="button secondary" type="submit">Use</button>
          </form>}
        </div>)}
      </div>
    </details> : null}

    <div className="account-sidebar-divider"/>

    <form action={logoutAction}>
      <button className="account-sidebar-signout" type="submit">
        <LogOut size={17} aria-hidden="true"/>
        <span>Sign out</span>
      </button>
    </form>
  </aside>;
}
