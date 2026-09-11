export default function CreditOrdersLoading() {
  return <section className="account-workspace-content stack" aria-busy="true" aria-live="polite">
    <header className="account-workspace-heading">
      <p className="eyebrow">Account</p>
      <h1>Credit orders</h1>
      <p className="muted">Loading credit orders…</p>
    </header>
    <section className="card basket-card">
      <strong>Loading authorised credit-order data…</strong>
      <p className="muted small">Checking the current company scope and available actions.</p>
    </section>
  </section>;
}
