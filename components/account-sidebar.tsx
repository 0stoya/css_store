"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  Repeat2,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { logoutAction, selectCompanyAction } from "@/app/actions";

export type AccountSection = "overview" | "orders" | "approvals" | "po-numbers" | "repeat-orders" | "credit-orders" | "returns";

type SidebarCompany = {
  company_id: number;
  name: string | null;
  reference: string | null;
  selected: boolean;
  active?: boolean;
};

type AccountSidebarProps = {
  name: string;
  email: string;
  companies: SidebarCompany[];
  showApprovals?: boolean;
  showPoNumbers?: boolean;
  approvalCount?: number;
  poCount?: number;
  recentSalesOrder?: boolean;
};

const operationalLinks: Array<{
  section: Exclude<AccountSection, "overview" | "approvals" | "po-numbers">;
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
}> = [
  { section: "orders", href: "/account/orders", label: "Order history", Icon: PackageSearch },
  { section: "repeat-orders", href: "/account/repeat-orders", label: "Repeat orders", Icon: Repeat2 },
  { section: "credit-orders", href: "/account/credit-orders", label: "Credit orders", Icon: ClipboardCheck },
  { section: "returns", href: "/account/returns", label: "Returns", Icon: RotateCcw },
];

function currentSection(pathname: string, scope: string | null, from: string | null): AccountSection {
  if (pathname.startsWith("/account/orders")) return "orders";
  if (pathname.startsWith("/account/repeat-orders")) return "repeat-orders";
  if (pathname.startsWith("/account/returns")) return "returns";
  if (pathname.startsWith("/account/credit-orders")) {
    if (scope?.toUpperCase() === "APPROVAL" || from === "approvals") return "approvals";
    if (scope?.toUpperCase() === "PO" || from === "po") return "po-numbers";
    return "credit-orders";
  }
  return "overview";
}

function SidebarLink({
  section,
  href,
  label,
  Icon,
  active,
  count,
  countLabel,
  recentToday = false,
  countKind = "approval",
}: {
  section: AccountSection;
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  active: AccountSection;
  count?: number;
  countLabel?: string;
  recentToday?: boolean;
  countKind?: "approval" | "po";
}) {
  const isActive = section === active;
  const pending = typeof count === "number" && Number.isInteger(count) && count > 0 ? count : 0;
  return <Link
    className={`account-sidebar-link ${isActive ? "active" : ""}`}
    href={href}
    aria-current={isActive ? "page" : undefined}
    prefetch
  >
    <Icon size={18} aria-hidden="true"/>
    <span className="account-sidebar-link-label">{label}</span>
    {pending > 0 ? <span
      className={`account-sidebar-alert-count account-sidebar-alert-count-${countKind}`}
      aria-label={`${pending} ${countLabel || "items waiting"}`}
      title={`${pending} ${countLabel || "items waiting"}`}
    >{pending > 99 ? "99+" : pending}</span> : null}
    {recentToday ? <span className="account-sidebar-alert-recent"
      aria-label="A sales order was placed today"
      title="At least one visible sales order was placed today (not an unread count)"
    >New</span> : null}
  </Link>;
}

export function AccountSidebar({
  name,
  email,
  companies,
  showApprovals = false,
  showPoNumbers = false,
  approvalCount = 0,
  poCount = 0,
  recentSalesOrder = false,
}: AccountSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = currentSection(pathname, searchParams.get("scope"), searchParams.get("from"));
  const activeCompanies = companies.filter((company) => company.active !== false);
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
      <SidebarLink
        section="orders"
        href="/account/orders"
        label="Order history"
        Icon={PackageSearch}
        active={active}
        recentToday={recentSalesOrder}
      />

      {showApprovals ? <SidebarLink
        section="approvals"
        href="/account/credit-orders?scope=APPROVAL"
        label="Order approvals"
        Icon={CheckCircle2}
        active={active}
        count={approvalCount}
        countLabel="orders awaiting purchase approval"
        countKind="approval"
      /> : null}

      {showPoNumbers ? <SidebarLink
        section="po-numbers"
        href="/account/credit-orders?scope=PO"
        label="Awaiting PO numbers"
        Icon={FileCheck2}
        active={active}
        count={poCount}
        countLabel="approved orders awaiting PO numbers"
        countKind="po"
      /> : null}

      {operationalLinks.slice(1).map(({ section, href, label, Icon }) => <SidebarLink
        section={section}
        href={href}
        label={label}
        Icon={Icon}
        active={active}
        key={href}
      />)}
    </nav>

    <div className="account-sidebar-divider"/>

    <nav className="account-sidebar-nav account-sidebar-overview" aria-label="Account overview">
      <SidebarLink
        section="overview"
        href="/account"
        label="Overview"
        Icon={LayoutDashboard}
        active={active}
      />
    </nav>

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
