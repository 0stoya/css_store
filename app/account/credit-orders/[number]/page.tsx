import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCreditOrder } from "@/lib/magento/credit-orders";
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
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const token = await requireCustomerToken();
  const [{ number: encodedNumber }, messages] = await Promise.all([params, searchParams]);
  const number = decodeURIComponent(encodedNumber);
  const data = await getCreditOrder(token, number);
  const order = data.css_credit_order;
  const currentUser = data.css_company_context.selected_company_user_id;
  const selectedCompany = data.css_company_context.companies.find((company) => company.selected) || null;
  const customerName = `${data.customer.firstname} ${data.customer.lastname}`.trim();
  const status = order.status.toLowerCase();
  const canPlace = order.actions.can_place_order && !order.actions.requires_payment_details;
  const missingPoCandidate = status === "approved"
    && !order.actions.can_place_order
    && !order.actions.requires_payment_details;

  return <>
    <SiteHeader customerName={customerName} companyName={selectedCompany?.name}/>
    <main className="shell stack">
      <div className="basket-heading">
        <div>
          <p className="eyebrow">Credit order {order.number}</p>
          <h1>{readableStatus(order.status)}</h1>
          <p className="muted">Fluid is authoritative for visibility, status and every available action on this credit order.</p>
        </div>
        <Link className="button secondary" href="/account/credit-orders">Back to credit orders</Link>
      </div>

      {messages.error ? <p className="error">{messages.error}</p> : null}
      {messages.notice ? <p className="success">{messages.notice}</p> : null}
      {order.actions.requires_payment_details ? <div className={styles.warning}>
        <strong>Payment details are required before this credit order can become a Magento order.</strong>
        <p className="small">The `approved_pending_payment` resume path is intentionally outside the current storefront launch UI. Do not use Place order for this state.</p>
      </div> : null}

      <div className={styles.detailGrid}>
        <div className="stack">
          <section className={`card ${styles.summaryCard}`}>
            <div className={styles.linkedOrder}>
              <span className="badge">{order.status}</span>
              {order.auto_approved ? <span className="badge">Auto approved</span> : null}
              {order.order_number ? <span className="badge">Magento order {order.order_number}</span> : null}
            </div>
            <dl className={styles.summaryGrid}>
              <div><dt>Credit order</dt><dd>{order.number}</dd></div>
              <div><dt>Grand total</dt><dd>{money(order.grand_total)}</dd></div>
              <div><dt>Created by</dt><dd>{actorLabel(order.creator_company_user_id, currentUser)}</dd></div>
              <div><dt>Approvals recorded</dt><dd>{order.approved_by.length}</dd></div>
              <div><dt>Payment method</dt><dd>{order.payment_method || "—"}</dd></div>
              <div><dt>Shipping method</dt><dd>{order.shipping_method || "—"}</dd></div>
              <div><dt>Created</dt><dd>{order.created_at || "—"}</dd></div>
              <div><dt>Updated</dt><dd>{order.updated_at || "—"}</dd></div>
            </dl>
            {order.order_number ? <p>
              <Link className="button secondary" href="/account/orders">View Magento order history</Link>
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
              <label className="field">
                <span>Add a comment</span>
                <textarea name="comment" required placeholder="Comment for this credit order"/>
              </label>
              <div><button className="button secondary" type="submit">Add comment</button></div>
            </form> : null}
          </section>

          <section className={`card ${styles.timelineCard}`}>
            <h2>Lifecycle history</h2>
            {order.logs.length ? <div className={styles.timeline}>
              {order.logs.map((log) => <article className={styles.timelineItem} key={log.log_id}>
                <div className={styles.timelineMeta}>
                  <strong>{log.activity_type ? readableStatus(log.activity_type) : "Credit-order update"}</strong>
                  <span className="muted small">{log.created_at || ""}</span>
                </div>
                {log.message ? <p>{log.message}</p> : null}
                <div className="muted small">{actorLabel(log.actor_company_user_id, currentUser)}</div>
              </article>)}
            </div> : <p className={styles.emptyTimeline}>No lifecycle history is available.</p>}
          </section>

          <section className="notice">
            <strong>Product and Employee line detail</strong>
            <p className="muted small">The current Fluid credit-order GraphQL detail does not expose immutable item lines. The storefront therefore does not reconstruct them from client state. Once a Magento sales order exists, configured/grouped line detail and Employee snapshots remain available through Order history.</p>
          </section>
        </div>

        <aside className="stack">
          <section className={`card ${styles.actionCard}`}>
            <h2>Available actions</h2>
            <p className="muted small">Controls are rendered from the current Fluid action state and re-checked on the server before mutation.</p>
            <div className={styles.actionStack}>
              {order.actions.can_approve ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
                <input type="hidden" name="number" value={order.number}/>
                <input type="hidden" name="action" value="approve"/>
                <strong>Approve</strong>
                <textarea name="comment" placeholder="Optional approval comment"/>
                <button className="button" type="submit">Approve credit order</button>
              </form> : null}

              {order.actions.can_reject ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
                <input type="hidden" name="number" value={order.number}/>
                <input type="hidden" name="action" value="reject"/>
                <strong>Reject</strong>
                <textarea name="comment" placeholder="Optional rejection comment"/>
                <button className={`button ${styles.dangerButton}`} type="submit">Reject credit order</button>
              </form> : null}

              {order.actions.can_cancel ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
                <input type="hidden" name="number" value={order.number}/>
                <input type="hidden" name="action" value="cancel"/>
                <strong>Cancel</strong>
                <textarea name="comment" placeholder="Optional cancellation comment"/>
                <button className={`button ${styles.dangerButton}`} type="submit">Cancel credit order</button>
              </form> : null}

              {missingPoCandidate ? <form action={setCreditOrderPurchaseOrderNumberAction} className={styles.actionForm}>
                <input type="hidden" name="number" value={order.number}/>
                <strong>Complete purchase order number</strong>
                <p className="muted small">Approved but not yet placeable. Fluid will validate both your PO-entry permission and whether a PO number is actually required.</p>
                <label className="field">
                  <span>PO number</span>
                  <input name="purchase_order_number" required maxLength={16} pattern="[A-Za-z0-9-]+" autoComplete="off"/>
                </label>
                <button className="button" type="submit">Submit PO number</button>
              </form> : null}

              {canPlace ? <form action={creditOrderLifecycleAction} className={styles.actionForm}>
                <input type="hidden" name="number" value={order.number}/>
                <input type="hidden" name="action" value="place"/>
                <strong>Create Magento order</strong>
                <textarea name="comment" placeholder="Optional placement comment"/>
                <button className="button" type="submit">Place approved order</button>
              </form> : null}

              {!order.actions.can_approve
                && !order.actions.can_reject
                && !order.actions.can_cancel
                && !missingPoCandidate
                && !canPlace
                ? <p className="muted">No lifecycle action is currently available to this user.</p>
                : null}
            </div>
          </section>
        </aside>
      </div>
    </main>
  </>;
}
