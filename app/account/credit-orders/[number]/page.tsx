import Link from "next/link";
import { AccountSidebar } from "@/components/account-sidebar";
import { SiteHeader } from "@/components/site-header";
import { getCustomerContext } from "@/lib/magento/context";
import { canUseCreditOrderScope, getCreditOrder } from "@/lib/magento/credit-orders";
import { requireCustomerToken } from "@/lib/session";
import {
  addCreditOrderCommentAction,
  creditOrderLifecycleAction,
  setCreditOrderPurchaseOrderNumberAction,
} from "../actions";
import styles from "../credit-orders.module.css";

export const metadata = { title: "Credit order" };

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function readableStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actorLabel(actor: number | null, currentUser: number | null) {
  if (!actor) return "System";
  return actor === currentUser ? "You" : `Company user #${actor}`;
}

export default async function CreditOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ error?: string; notice?: string; from?: string }>;
}) {
  const token = await requireCustomerToken();
  const [{ number }, messages] = await Promise.all([params, searchParams]);
  const [data, ctx, canApprove] = await Promise.all([
    getCreditOrder(token, number),
    getCustomerContext(token),
    canUseCreditOrderScope(token, "APPROVAL"),
  ]);
  const order = data.css_credit_order;
  const currentUser = data.css_company_context.selected_company_user_id;
  const selectedCompany = ctx.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${ctx.customer.firstname} ${ctx.customer.lastname}`.trim();
  const status = order.status.toLowerCase();
  const canPlace = order.actions.can_place_order && !order.actions.requires_payment_details;
  const missingPoCandidate = status === "approved"
    && !order.actions.can_place_order
    && !order.actions.requires_payment_details;
  const fromApprovals = messages.from === "approvals" && canApprove;
  const backHref = fromApprovals ? "/account/credit-orders?scope=APPROVAL" : "/account/credit-orders";
  const backLabel = fromApprovals ? "Back to approvals" : "Back to credit orders";
  const approvalContext = fromApprovals ? <input type="hidden" name="from" value="approvals"/> : null;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell account-workspace">
      <AccountSidebar
        name={customerName}
        email={ctx.customer.email}
        companies={ctx.css_company_context.companies}
        active={fromApprovals ? "approvals" : "credit-orders"}
        showApprovals={canApprove}
      />

      <section className="account-workspace-content stack">
        <header className="portal-page-header">
          <div className="portal-page-heading">
            <p className="eyebrow">Credit order {order.number}</p>
            <h1>{readableStatus(order.status)}</h1>
            <p className="muted">Review the order status, activity and any actions currently available to you.</p>
          </div>
          <Link className="button secondary" href={backHref}>{backLabel}</Link>
        </header>

        {messages.error ? <p className="error" role="alert">{messages.error}</p> : null}
        {messages.notice ? <p className="success" role="status">{messages.notice}</p> : null}
        {order.actions.requires_payment_details ? <div className={styles.warning} role="status">
          <strong>Payment details are required before this order can be completed.</strong>
          <p className="small">This portal can’t collect the required payment details for this order yet. Please contact our team for help completing it.</p>
        </div> : null}

        <div className={styles.detailGrid}>
          <div className="stack">
            <section className={`card ${styles.summaryCard}`}>
              <div className={styles.linkedOrder}>
                <span className="badge">{readableStatus(order.status)}</span>
                {order.auto_approved ? <span className="badge">Automatically approved</span> : null}
                {order.order_number ? <span className="badge">Order {order.order_number}</span> : null}
              </div>
              <dl className={styles.summaryGrid}>
                <div><dt>Credit order</dt><dd>{order.number}</dd></div>
                <div><dt>Grand total</dt><dd>{money(order.grand_total)}</dd></div>
                <div><dt>Created by</dt><dd>{actorLabel(order.creator_company_user_id, currentUser)}</dd></div>
                <div><dt>Approvals recorded</dt><dd>{order.approved_by.length}</dd></div>
                <div><dt>Payment method</dt><dd>{order.payment_method || "—"}</dd></div>
                <div><dt>Delivery method</dt><dd>{order.shipping_method || "—"}</dd></div>
                <div><dt>Created</dt><dd>{order.created_at || "—"}</dd></div>
                <div><dt>Updated</dt><dd>{order.updated_at || "—"}</dd></div>
              </dl>
              {order.order_number ? <p>
                <Link className="button secondary" href="/account/orders">View order history</Link>
              </p> : null}
            </section>

            <section className={`card ${styles.timelineCard}`}>
              <h2>Comments</h2>
              {order.comments.length ? <div className={styles.timeline}>
                {order.comments.map((comment) => <article className={styles.timelineItem} key={comment.comment_id}>
                  <div className={styles.timelineMeta}>
                    <strong>{actorLabel(comment.creator_company_user_id, currentUser)}</strong>
                    <span className="muted small">{comment.created_at || ""}</span>
                  </div>
                  <p>{comment.comment}</p>
                </article>)}
              </div> : <p className={styles.emptyTimeline}>No comments have been added.</p>}

              {order.actions.can_add_comment ? <form action={addCreditOrderCommentAction} className={styles.commentForm}>
                <input type="hidden" name="number" value={order.number}/>
                {approvalContext}
                <label className="field">
                  <span>Add a comment</span>
                  <textarea name="comment" required placeholder="Write a comment about this credit order"/>
                </label>
                <div><button className="button secondary" type="submit">Add comment</button></div>
              </form> : null}
            </section>

            <section className={`card ${styles.timelineCard}`}>
              <h2>Activity history</h2>
              {order.logs.length ? <div className={styles.timeline}>
                {order.logs.map((log) => <article className={styles.timelineItem} key={log.log_id}>
                  <div className={styles.timelineMeta}>
                    <strong>{log.activity_type ? readableStatus(log.activity_type) : "Order update"}</strong>
                    <span className="muted small">{log.created_at || ""}</span>
                  </div>
                  {log.message ? <p>{log.message}</p> : null}
                  <div className="muted small">{actorLabel(log.actor_company_user_id, currentUser)}</div>
                </article>)}
              </div> : <p className={styles.emptyTimeline}>No activity history is available.</p>}
            </section>
          </div>

          <aside className="stack">
            <section className={`card ${styles.actionCard}`}>
              <h2>Available actions</h2>
              <p className="muted small">Only actions available to your account are shown here.</p>
              <div className={styles.actionStack}>
                {order.actions.can_approve ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
                  <input type="hidden" name="number" value={order.number}/>
                  <input type="hidden" name="action" value="approve"/>
                  {approvalContext}
                  <strong>Approve</strong>
                  {order.actions.can_add_comment ? <textarea name="comment" placeholder="Optional approval comment"/> : null}
                  <button className="button" type="submit">Approve credit order</button>
                </form> : null}

                {order.actions.can_reject ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
                  <input type="hidden" name="number" value={order.number}/>
                  <input type="hidden" name="action" value="reject"/>
                  {approvalContext}
                  <strong>Reject</strong>
                  {order.actions.can_add_comment ? <textarea name="comment" placeholder="Optional rejection comment"/> : null}
                  <button className={`button ${styles.dangerButton}`} type="submit">Reject credit order</button>
                </form> : null}

                {order.actions.can_cancel ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
                  <input type="hidden" name="number" value={order.number}/>
                  <input type="hidden" name="action" value="cancel"/>
                  {approvalContext}
                  <strong>Cancel</strong>
                  {order.actions.can_add_comment ? <textarea name="comment" placeholder="Optional cancellation comment"/> : null}
                  <button className={`button ${styles.dangerButton}`} type="submit">Cancel credit order</button>
                </form> : null}

                {missingPoCandidate ? <form action={setCreditOrderPurchaseOrderNumberAction} className={styles.actionForm}>
                  <input type="hidden" name="number" value={order.number}/>
                  {approvalContext}
                  <strong>Add purchase order number</strong>
                  <p className="muted small">This approved order may need a PO number before it can continue.</p>
                  <label className="field">
                    <span>PO number</span>
                    <input name="purchase_order_number" required maxLength={16} pattern="[A-Za-z0-9-]+" autoComplete="off"/>
                  </label>
                  <button className="button" type="submit">Submit PO number</button>
                </form> : null}

                {canPlace ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
                  <input type="hidden" name="number" value={order.number}/>
                  <input type="hidden" name="action" value="place"/>
                  {approvalContext}
                  <strong>Place approved order</strong>
                  {order.actions.can_add_comment ? <textarea name="comment" placeholder="Optional placement comment"/> : null}
                  <button className="button" type="submit">Place order</button>
                </form> : null}

                {!order.actions.can_approve
                  && !order.actions.can_reject
                  && !order.actions.can_cancel
                  && !missingPoCandidate
                  && !canPlace
                  ? <p className="muted">No action is currently available.</p>
                  : null}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  </>;
}
