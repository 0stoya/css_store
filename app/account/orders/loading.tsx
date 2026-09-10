import styles from "./orders.module.css";

export default function OrdersLoading() {
  return <main className="shell stack">
    <div className="basket-heading">
      <div>
        <p className="eyebrow">Customer account · orders</p>
        <h1>Order history</h1>
        <p className="muted">Loading company-scoped Magento orders…</p>
      </div>
    </div>
    <section className={`card ${styles.intro}`}><span className="muted">Loading orders…</span></section>
    <section className={`card ${styles.card}`}><div className={styles.summary}><strong>Loading order details…</strong></div></section>
  </main>;
}
