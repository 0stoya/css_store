import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import {
  canUseCreditOrderScope,
  getCreditOrders,
  type CreditOrder,
  type CreditOrderScope,
} from "@/lib/magento/credit-orders";
import { requireCustomerToken } from "@/lib/session";
import styles from "./credit-orders.module.css";

export const metadata = { title: "Credit orders" };

const PAGE_SIZE = 10;
const SCOPES: Array<{ value: CreditOrderScope; label: string }> = [
  { value: "MY", label: "My credit orders" },
  { value: "COMPANY", label: "Company" },
  { value: "APPROVAL", label: "Approval queue" },
];

function positivePage(value: string | undefined) {
  const page = Number(value || "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function requestedScope(value: string | undefined): CreditOrderScope {
  const scope = String(value || "MY").toUpperCase();
  return scope === "COMPANY" || scope === "APPROVAL" ? scope : "MY";
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function readableStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionSummary(order: CreditOrder) {
  const actions: string[] = [];
  if (order.actions.can_approve) actions.push("Approval available");
  if (order.actions.can_reject) actions.push("Rejection available");
  if (order.actions.can_cancel) actions.push("Cancellation available");
  if (order.actions.can_place_order && !order.actions.requires_payment_details) actions.push("Ready to place");
  if (order.actions.requires_payment_details) actions.push("Payment details required");
  return actions;
}

export default async function CreditOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; page?: string; error?: string }>;
}) {
  const token = await requireCustomerToken();
  const params = await searchParams;
  const requested = requestedScope(params.scope);
  const page = positivePage(params.page);

  const [ctx, myAllowed, companyAllowed, approvalAllowed] = await Promise.all([
    getCustomerContext(token),
    canUseCreditOrderScope(token, "MY"),
    canUseCreditOrderScope(token, "COMPANY"),
    canUseCreditOrderScope(token, "APPROVAL"),
  ]);

  const allowedScopes = new Set<CreditOrderScope>();
  if (myAllowed) allowedScopes.add("MY");
  if (companyAllowed) allowedScopes.add("COMPANY");
  if (approvalAllowed) allowedScopes.add("APPROVAL");

  const activeScope = allowedScopes.has(requested)
    ? requested
    : SCOPES.find((scope) => allowedScopes.has(scope.value))?.value || null;
  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();

  if (!activeScope) {
    return <>
      <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
      <main className="shell stack">
        <header className="portal-page-header">
          <div className="portal-page-heading">
            <p className="eyebrow">Account</p>
            <h1>Credit orders</h1>
          </div>
          <Link className="button secondary" href="/account">Back to account</Link>
        </header>
        <section className="card empty">
          <h2>Credit orders aren’t available for this account</h2>
          <p className="muted">Your current account does not have access to a credit-order queue.</p>
        </section>
      </main>
    </>;
  }

  const data = await getCreditOrders(token, activeScope, page, PAGE_SIZE);
  const result = data.css_credit_orders;
  const currentPage = result.page_info.current_page || page;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell stack">
      <header className="portal-page-header">
        <div className="portal-page-heading">
          <p className="eyebrow">Account</p>
          <h1>Credit orders</h1>
          <p className="muted">Track credit orders and complete any approval actions available to you.</p>
        </div>
        <Link className="button secondary" href="/account">Back to account</Link>
      </header>

      {params.error ? <p className="error" role="alert">{params.error}</p> : null}
      {requested !== activeScope ? <p className="notice" role="status">That view isn’t available to your account, so we’ve shown the closest available view instead.</p> : null}

      <nav className={styles.scopeBar} aria-label="Credit-order views">
        {SCOPES.filter((scope) => allowedScopes.has(scope.value)).map((scope) => {
          const active = scope.value === activeScope;
          return <Link
            className={`${styles.scopeLink} ${active ? styles.scopeLinkActive : ""}`}
            href={`/account/credit-orders?scope=${scope.value}`}
            key={scope.value}
            aria-current={active ? "page" : undefined}
          >{scope.label}</Link>;
        })}
      </nav>

      <section className="card basket-card">
        <strong>{result.total_count} {result.total_count === 1 ? "credit order" : "credit orders"}</strong>
        <p className="muted small">{SCOPES.find((scope) => scope.value === activeScope)?.label} · {selectedCompany?.name || "Current company"}</p>
      </section>

      {!result.items.length ? <section className="card empty">
        <h2>No credit orders here</h2>
        <p className="muted">There are no credit orders in this view right now.</p>
      </section> : <div className={styles.list}>
        {result.items.map((order) => {
          const actions = actionSummary(order);
          return <article className={`card ${styles.orderCard}`} key={order.number}>
            <div>
              <p className="eyebrow">Credit order {order.number}</p>
              <h2>{readableStatus(order.status)}</h2>
              <div className={styles.orderMeta}>
                <span className="badge">{readableStatus(order.status)}</span>
                {order.created_at ? <span className="muted small">Created {order.created_at}</span> : null}
                {order.order_number ? <span className="badge">Order {order.order_number}</span> : null}
                {order.auto_approved ? <span className="badge">Automatically approved</span> : null}
              </div>
              {actions.length ? <div className={styles.actionBadges}>
                {actions.map((action) => <span className="badge" key={action}>{action}</span>)}
              </div> : null}
            </div>
            <div className={styles.orderActions}>
              <span className={styles.amount}>{money(order.grand_total)}</span>
              <Link className="button" href={`/account/credit-orders/${encodeURIComponent(order.number)}`}>View details</Link>
            </div>
          </article>;
        })}
      </div>}

      {result.page_info.total_pages > 1 ? <nav className="pagination" aria-label="Credit-order pages">
        {currentPage > 1
          ? <Link className="button secondary" href={`/account/credit-orders?scope=${activeScope}&page=${currentPage - 1}`}>Previous</Link>
          : <span/>}
        <span className="muted">Page {currentPage} of {result.page_info.total_pages}</span>
        {currentPage < result.page_info.total_pages
          ? <Link className="button secondary" href={`/account/credit-orders?scope=${activeScope}&page=${currentPage + 1}`}>Next</Link>
          : <span/>}
      </nav> : null}
    </main>
  </>;
}
