import { purchaseAllowanceView, type PurchaseAllowanceEligibility } from "@/lib/purchase-allowance";
import styles from "./purchase-allowance-summary.module.css";

type Props = {
  eligibility: PurchaseAllowanceEligibility | null | undefined;
  items: Array<{
    product: { allowance_product_id?: number | null; name: string };
    css_kit: { parent_kit_product_id: number } | null;
  }>;
};

const quantity = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 4 });

export function PurchaseAllowanceSummary({ eligibility, items }: Props) {
  const view = purchaseAllowanceView(eligibility, items);
  if (!view) return null;
  if (view.unavailable) return <section className={`card ${styles.panel}`} aria-label="Purchase approval">
    <p>Purchase approval status is unavailable. Checkout will check again before submission.</p>
  </section>;

  return <section className={`card ${styles.panel}`} aria-label="Buyer allowances and company approval">
    {view.requiresApproval ? <p className={styles.approval}><strong>Company approval is required for this basket.</strong> Fluid will confirm the outcome through your company order workflow.</p> : null}
    {view.rows.length ? <details open={view.requiresApproval}>
      <summary>Buyer allowance records</summary>
      <p className={styles.explanation}>These quantities belong to the company user ordering, not the selected Employee. Remaining quantities are before this basket. They are allowance records, not purchasing permission: other company approval rules may apply.</p>
      <ul className={styles.records}>
        {view.rows.map((row) => <li key={row.logical_product_id}>
          <h3>{row.label}</h3>
          <dl>
            <div><dt>Allowance</dt><dd>{quantity.format(row.allowed_quantity)}</dd></div>
            <div><dt>Previously purchased</dt><dd>{quantity.format(row.purchased_quantity)}</dd></div>
            <div><dt>Remaining before basket</dt><dd>{quantity.format(row.remaining_quantity)}</dd></div>
            <div><dt>In this basket</dt><dd>{quantity.format(row.requested_quantity)}</dd></div>
          </dl>
          {row.showRecordedExcess ? <p className={styles.explanation}>This selection exceeds the recorded allowance. The overall company approval decision is shown above.</p> : null}
        </li>)}
      </ul>
      <p className={styles.explanation}>Rows sharing a product allowance are counted together by Magento, including quantities assigned to different Employees. Checkout rechecks the basket before submission.</p>
    </details> : null}
  </section>;
}
