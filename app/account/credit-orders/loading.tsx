export default function CreditOrdersLoading() {
  return <main className="shell stack">
    <div className="basket-heading">
      <div>
        <p className="eyebrow">Customer account · credit orders</p>
        <h1>Loading credit orders…</h1>
        <p className="muted">Checking the current Fluid company scope and lifecycle queues.</p>
      </div>
    </div>
    <section className="card basket-card">
      <p className="muted">Loading authorised credit-order data…</p>
    </section>
  </main>;
}
