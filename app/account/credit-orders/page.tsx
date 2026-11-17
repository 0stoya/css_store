import Link from "next/link";
import { ArrowRight, CircleCheckBig, Clock3, FileText, WalletCards } from "lucide-react";
import { CataloguePagination } from "@/components/catalogue-pagination";
import { getCustomerContext } from "@/lib/magento/context";
import {
  canUseCreditOrderScope,
  getCreditOrders,
  type CreditOrder,
  type CreditOrderScope,
} from "@/lib/magento/credit-orders";
import { requireCustomerToken } from "@/lib/session";
import { formatCreditOrderDateTime, readableCreditOrderStatus } from "./presentation";
import styles from "./credit-orders.module.css";

export const metadata = { title: "Credit orders" };

const PAGE_SIZE = 10;
const SCOPES: Array<{ value: CreditOrderScope; label: string }> = [
  { value: "MY", label: "My credit orders" },
  { value: "COMPANY", label: "Company" },
  { value: "APPROVAL", label: "Approval queue" },
  { value: "PO", label: "Awaiting PO numbers" },
];

function positivePage(value: string | undefined) {
  const page = Number(value || "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function requestedScope(value: string | undefined): CreditOrderScope {
  const scope = String(value || "MY").toUpperCase();
  return scope === "COMPANY" || scope === "APPROVAL" || scope === "PO" ? scope : "MY";
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function actionSummary(order: CreditOrder) {
  const actions: string[] = [];
  if (order.actions.can_approve || order.actions.can_reject) actions.push("Decision required");
  if (order.actions.can_cancel) actions.push("Can cancel");
  if (order.actions.can_place_order && !order.actions.requires_payment_details) actions.push("Ready to place");
  if (order.actions.can_enter_po_number) actions.push("PO reference required");
  if (order.actions.requires_payment_details) actions.push("Payment required");
  return actions;
}

export default async function CreditOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; page?: string; error?: string; notice?: string }>;
}) {
  const token = await requireCustomerToken();
  const params = await searchParams;
  const requested = requestedScope(params.scope);
  const page = positivePage(params.page);

  const [ctx, myAllowed, companyAllowed, approvalAllowed, poAllowed] = await Promise.all([
    getCustomerContext(token),
    canUseCreditOrderScope(token, "MY"),
    canUseCreditOrderScope(token, "COMPANY"),
    canUseCreditOrderScope(token, "APPROVAL"),
    canUseCreditOrderScope(token, "PO"),
  ]);

  const allowedScopes = new Set<CreditOrderScope>();
  if (myAllowed) allowedScopes.add("MY");
  if (companyAllowed) allowedScopes.add("COMPANY");
  if (approvalAllowed) allowedScopes.add("APPROVAL");
  if (poAllowed) allowedScopes.add("PO");

  const activeScope = allowedScopes.has(requested)
    ? requested
    : SCOPES.find((scope) => allowedScopes.has(scope.value))?.value || null;
  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;

  if (!activeScope) {
    return <section className="account-workspace-content stack">
      <header className="account-workspace-heading">
        <p className="eyebrow">Account</p>
        <h1>Credit orders</h1>
      </header>
      <section className="card empty">
        <h2>Credit orders aren’t available for this account</h2>
        <p className="muted">Your current account does not have access to a credit-order queue.</p>
      </section>
    </section>;
  }

  const data = await getCreditOrders(token, activeScope, page, PAGE_SIZE);
  const result = data.css_credit_orders;
  const currentPage = result.page_info.current_page || page;
  const isApprovalQueue = activeScope === "APPROVAL";
  const isPoQueue = activeScope === "PO";
  const activeScopeLabel = SCOPES.find((scope) => scope.value === activeScope)?.label || "Credit orders";

  return <section className="account-workspace-content stack">
    <header className="account-workspace-heading">
      <p className="eyebrow">Account</p>
      <h1>{isApprovalQueue ? "Order approvals" : isPoQueue ? "Awaiting PO numbers" : "Credit orders"}</h1>
      <p className="muted">
        {isApprovalQueue
          ? "Review credit orders that are waiting for your decision."
          : isPoQueue
            ? "Purchases approved by managers, awaiting their official PO reference. Entering it may release the sales order."
            : "Track credit orders from approval through to sales order."}
      </p>
    </header>

    {params.error ? <p className="error" role="alert">{params.error}</p> : null}
    {params.notice ? <p className="success" role="status">{params.notice}</p> : null}
    {requested !== activeScope ? <p className="notice" role="status">That view isn’t available to your account, so we’ve shown the closest available view instead.</p> : null}

    {!isApprovalQueue ? <nav className={styles.scopeBar} aria-label="Credit-order views">
      {SCOPES.filter((scope) => scope.value !== "APPROVAL" && allowedScopes.has(scope.value)).map((scope) => {
        const active = scope.value === activeScope;
        return <Link
          className={`${styles.scopeLink} ${active ? styles.scopeLinkActive : ""}`}
          href={`/account/credit-orders?scope=${scope.value}`}
          key={scope.value}
          aria-current={active ? "page" : undefined}
          prefetch
        >{scope.label}</Link>;
      })}
    </nav> : null}

    <div className={styles.listToolbar}>
      <div className={styles.listToolbarCopy}>
        <span className={styles.listToolbarIcon}>{isApprovalQueue ? <CircleCheckBig size={18} aria-hidden="true"/> : <WalletCards size={18} aria-hidden="true"/>}</span>
        <div>
          <strong>{result.total_count} {result.total_count === 1
              ? (isApprovalQueue ? "order awaiting review" : isPoQueue ? "order awaiting PO" : "credit order")
              : (isApprovalQueue ? "orders awaiting review" : isPoQueue ? "orders awaiting PO" : "credit orders")}</strong>
          <span>{activeScopeLabel} · {selectedCompany?.name || "Current company"}</span>
        </div>
      </div>
    </div>

    {!result.items.length ? <section className="card empty">
      <h2>{isApprovalQueue ? "No approvals waiting" : isPoQueue ? "No PO numbers waiting" : "No credit orders here"}</h2>
      <p className="muted">{isApprovalQueue
        ? "There are no credit orders waiting for your approval right now."
        : isPoQueue
          ? "All approved orders in this company have their PO reference, or none require one."
          : "There are no credit orders in this view right now."}</p>
    </section> : <div className={styles.list}>
      {result.items.map((order) => {
        const actions = actionSummary(order);
        return <article className={`card ${styles.orderCard}`} key={order.number}>
          <div className={styles.orderIcon}><FileText size={19} aria-hidden="true"/></div>
          <div className={styles.orderContent}>
            <div className={styles.orderTitleRow}>
              <div>
                <p className={styles.orderNumber}>Credit order {order.number}</p>
                <h2>{readableCreditOrderStatus(order.status)}</h2>
              </div>
              <span className={styles.amount}>{money(order.grand_total)}</span>
            </div>

            <div className={styles.orderMeta}>
              {order.created_at ? <span className={styles.metaItem}><Clock3 size={14} aria-hidden="true"/>{formatCreditOrderDateTime(order.created_at)}</span> : null}
              {order.order_number ? <span className={styles.softBadge}>Sales order {order.order_number}</span> : null}
              {order.auto_approved ? <span className={styles.softBadge}>Auto approved</span> : null}
            </div>

            {actions.length ? <div className={styles.actionBadges}>
              {actions.map((action) => <span className={styles.softBadge} key={action}>{action}</span>)}
            </div> : null}
          </div>
          <Link className={styles.detailsLink} href={`/account/credit-orders/${encodeURIComponent(order.number)}${isApprovalQueue ? "?from=approvals" : isPoQueue ? "?from=po" : ""}`}>
            <span>View details</span><ArrowRight size={17} aria-hidden="true"/>
          </Link>
        </article>;
      })}
    </div>}

    <CataloguePagination
      currentPage={currentPage}
      totalPages={result.page_info.total_pages}
      href={(targetPage) => `/account/credit-orders?scope=${activeScope}${targetPage > 1 ? `&page=${targetPage}` : ""}`}
      label="Credit-order pages"
    />
  </section>;
}
