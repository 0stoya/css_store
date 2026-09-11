import styles from "./orders.module.css";

export default function OrdersLoading() {
  return <section className="account-workspace-content stack" aria-busy="true" aria-live="polite">
    <header className="account-workspace-heading">
      <p className="eyebrow">Account</p>
      <h1>Order history</h1>
      <p className="muted">Loading orders…</p>
    </header>
    <div className={styles.toolbar}>
      <div><strong>Loading order history</strong><span>Fetching the latest company orders</span></div>
    </div>
    <div className={styles.list}>
      <section className={`card ${styles.card}`}><div className={styles.summary}><strong>Loading order…</strong></div></section>
      <section className={`card ${styles.card}`}><div className={styles.summary}><strong>Loading order…</strong></div></section>
    </div>
  </section>;
}
