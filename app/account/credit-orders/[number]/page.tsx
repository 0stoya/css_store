import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CircleCheckBig,
  CreditCard,
  History,
  MessageSquareText,
  ReceiptText,
  Truck,
  UserRound,
} from "lucide-react";
import { canUseCreditOrderScope, getCreditOrder } from "@/lib/magento/credit-orders";
import { requireCustomerToken } from "@/lib/session";
import {
  creditOrderActivityPresentation,
  creditOrderActorLabel,
  creditOrderMethodLabel,
  formatCreditOrderDateTime,
  readableCreditOrderStatus,
} from "../presentation";
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

export default async function CreditOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ error?: string; notice?: string; from?: string }>;
}) {
  const token = await requireCustomerToken();
  const [{ number }, messages] = await Promise.all([params, searchParams]);
  const [data, canApprove] = await Promise.all([
    getCreditOrder(token, number),
    canUseCreditOrderScope(token, "APPROVAL"),
  ]);
  const order = data.css_credit_order;
  const currentUser = data.css_company_context.selected_company_user_id;
  const status = order.status.toLowerCase();
  const canPlace = order.actions.can_place_order && !order.actions.requires_payment_details;
  const missingPoCandidate = status === "approved"
    && !order.actions.can_place_order
    && !order.actions.requires_payment_details;
  const hasActions = order.actions.can_approve
    || order.actions.can_reject
    || order.actions.can_cancel
    || missingPoCandidate
    || canPlace;
  const fromApprovals = messages.from === "approvals" && canApprove;
  const backHref = fromApprovals ? "/account/credit-orders?scope=APPROVAL" : "/account/credit-orders";
  const backLabel = fromApprovals ? "Back to approvals" : "Back to credit orders";
  const approvalContext = fromApprovals ? <input type="hidden" name="from" value="approvals"/> : null;

  const comments = <section className={`card ${styles.timelineCard}`}>
    <header className={styles.sectionHeading}>
      <span className={styles.sectionIcon}><MessageSquareText size={19} aria-hidden="true"/></span>
      <div>
        <h2>Comments</h2>
        <p>{order.comments.length ? `${order.comments.length} ${order.comments.length === 1 ? "comment" : "comments"}` : "No comments yet"}</p>
      </div>
    </header>

    {order.comments.length ? <div className={styles.commentList}>
      {order.comments.map((comment) => <article className={styles.commentItem} key={comment.comment_id}>
        <div className={styles.commentMeta}>
          <span className={styles.commentAvatar}><UserRound size={15} aria-hidden="true"/></span>
          <div>
            <strong>{creditOrderActorLabel(comment.creator_company_user_id, currentUser)}</strong>
            <span>{formatCreditOrderDateTime(comment.created_at)}</span>
          </div>
        </div>
        <p>{comment.comment}</p>
      </article>)}
    </div> : null}

    {order.actions.can_add_comment ? <form action={addCreditOrderCommentAction} className={styles.commentForm}>
      <input type="hidden" name="number" value={order.number}/>
      {approvalContext}
      <label className="field">
        <span>Add a comment</span>
        <textarea name="comment" required placeholder="Add a note for this credit order"/>
      </label>
      <div className={styles.commentFormActions}><button className="button secondary" type="submit">Add comment</button></div>
    </form> : null}
  </section>;

  const activity = <section className={`card ${styles.timelineCard}`}>
    <header className={styles.sectionHeading}>
      <span className={styles.sectionIcon}><History size={19} aria-hidden="true"/></span>
      <div>
        <h2>Activity</h2>
        <p>{order.logs.length ? `${order.logs.length} ${order.logs.length === 1 ? "update" : "updates"}` : "No activity yet"}</p>
      </div>
    </header>

    {order.logs.length ? <div className={styles.activityTimeline}>
      {order.logs.map((log) => {
        const item = creditOrderActivityPresentation(log.activity_type, log.message);
        return <article className={styles.activityItem} key={log.log_id}>
          <span className={styles.activityMarker}><CircleCheckBig size={15} aria-hidden="true"/></span>
          <div className={styles.activityCopy}>
            <div className={styles.timelineMeta}>
              <strong>{item.title}</strong>
              <span>{formatCreditOrderDateTime(log.created_at)}</span>
            </div>
            {item.detail ? <p>{item.detail}</p> : null}
            <small>{creditOrderActorLabel(log.actor_company_user_id, currentUser)}</small>
          </div>
        </article>;
      })}
    </div> : null}
  </section>;

  const actions = hasActions ? <aside className={`card ${styles.actionCard}`}>
    <header className={styles.sectionHeading}>
      <span className={styles.sectionIcon}><BadgeCheck size={19} aria-hidden="true"/></span>
      <div>
        <h2>Available actions</h2>
        <p>Only actions currently available to you are shown.</p>
      </div>
    </header>
    <div className={styles.actionStack}>
      {order.actions.can_approve ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
        <input type="hidden" name="number" value={order.number}/>
        <input type="hidden" name="action" value="approve"/>
        {approvalContext}
        <strong>Approve credit order</strong>
        {order.actions.can_add_comment ? <textarea name="comment" placeholder="Optional approval comment"/> : null}
        <button className="button" type="submit">Approve</button>
      </form> : null}

      {order.actions.can_reject ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
        <input type="hidden" name="number" value={order.number}/>
        <input type="hidden" name="action" value="reject"/>
        {approvalContext}
        <strong>Reject credit order</strong>
        {order.actions.can_add_comment ? <textarea name="comment" placeholder="Optional rejection comment"/> : null}
        <button className={`button ${styles.dangerButton}`} type="submit">Reject</button>
      </form> : null}

      {order.actions.can_cancel ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
        <input type="hidden" name="number" value={order.number}/>
        <input type="hidden" name="action" value="cancel"/>
        {approvalContext}
        <strong>Cancel credit order</strong>
        {order.actions.can_add_comment ? <textarea name="comment" placeholder="Optional cancellation comment"/> : null}
        <button className={`button ${styles.dangerButton}`} type="submit">Cancel</button>
      </form> : null}

      {missingPoCandidate ? <form action={setCreditOrderPurchaseOrderNumberAction} className={styles.actionForm}>
        <input type="hidden" name="number" value={order.number}/>
        {approvalContext}
        <strong>Add purchase order number</strong>
        <p className="muted small">A PO number may be needed before this approved order can continue.</p>
        <label className="field">
          <span>PO number</span>
          <input name="purchase_order_number" required maxLength={16} pattern="[A-Za-z0-9-]+" autoComplete="off"/>
        </label>
        <button className="button" type="submit">Save PO number</button>
      </form> : null}

      {canPlace ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
        <input type="hidden" name="number" value={order.number}/>
        <input type="hidden" name="action" value="place"/>
        {approvalContext}
        <strong>Create sales order</strong>
        {order.actions.can_add_comment ? <textarea name="comment" placeholder="Optional placement comment"/> : null}
        <button className="button" type="submit">Place order</button>
      </form> : null}
    </div>
  </aside> : null;

  return <section className="account-workspace-content stack">
    <header className={`portal-page-header ${styles.detailHeader}`}>
      <div className="portal-page-heading">
        <p className="eyebrow">Credit order {order.number}</p>
        <h1>{readableCreditOrderStatus(order.status)}</h1>
        <p className="muted">Status, fulfilment and activity for this credit order.</p>
      </div>
      <Link className="button secondary" href={backHref}><ArrowLeft size={16} aria-hidden="true"/>{backLabel}</Link>
    </header>

    {messages.error ? <p className="error" role="alert">{messages.error}</p> : null}
    {messages.notice ? <p className="success" role="status">{messages.notice}</p> : null}
    {order.actions.requires_payment_details ? <div className={styles.warning} role="status">
      <strong>Payment details are required before this order can be completed.</strong>
      <p className="small">Please contact our team for help completing the payment step.</p>
    </div> : null}

    <section className={`card ${styles.summaryCard}`}>
      <div className={styles.summaryTop}>
        <div>
          <div className={styles.linkedOrder}>
            <span className={`${styles.statusBadge} ${styles.statusBadgePrimary}`}>{readableCreditOrderStatus(order.status)}</span>
            {order.auto_approved ? <span className={styles.softBadge}>Automatically approved</span> : null}
            {order.order_number ? <span className={styles.softBadge}>Sales order {order.order_number}</span> : null}
          </div>
          <p className={styles.summaryLabel}>Credit order</p>
          <strong className={styles.summaryNumber}>{order.number}</strong>
        </div>
        <div className={styles.summaryAmount}>
          <span>Order total</span>
          <strong>{money(order.grand_total)}</strong>
        </div>
      </div>

      <dl className={styles.summaryFacts}>
        <div><span className={styles.factIcon}><UserRound size={17} aria-hidden="true"/></span><div><dt>Created by</dt><dd>{creditOrderActorLabel(order.creator_company_user_id, currentUser)}</dd></div></div>
        <div><span className={styles.factIcon}><BadgeCheck size={17} aria-hidden="true"/></span><div><dt>Approvals</dt><dd>{order.approved_by.length}</dd></div></div>
        <div><span className={styles.factIcon}><CalendarClock size={17} aria-hidden="true"/></span><div><dt>Created</dt><dd>{formatCreditOrderDateTime(order.created_at)}</dd></div></div>
        <div><span className={styles.factIcon}><History size={17} aria-hidden="true"/></span><div><dt>Last updated</dt><dd>{formatCreditOrderDateTime(order.updated_at)}</dd></div></div>
      </dl>

      <div className={styles.fulfilmentGrid}>
        <div>
          <span className={styles.fulfilmentIcon}><CreditCard size={18} aria-hidden="true"/></span>
          <div><span>Payment</span><strong>{creditOrderMethodLabel(order.payment_method, "payment")}</strong></div>
        </div>
        <div>
          <span className={styles.fulfilmentIcon}><Truck size={18} aria-hidden="true"/></span>
          <div><span>Delivery</span><strong>{creditOrderMethodLabel(order.shipping_method, "shipping")}</strong></div>
        </div>
        {order.order_number ? <Link className={styles.salesOrderLink} href="/account/orders">
          <ReceiptText size={17} aria-hidden="true"/>
          <span>View sales order {order.order_number}</span>
        </Link> : null}
      </div>
    </section>

    {hasActions ? <div className={styles.detailGrid}>
      <div className="stack">{comments}{activity}</div>
      {actions}
    </div> : <div className={styles.detailGridNoActions}>{comments}{activity}</div>}
  </section>;
}
