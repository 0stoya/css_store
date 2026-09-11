"use client";

export default function OrdersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="account-workspace-content stack">
    <header className="account-workspace-heading">
      <p className="eyebrow">Account</p>
      <h1>Order history unavailable</h1>
      <p className="muted">The current company order history could not be loaded safely.</p>
    </header>
    <section className="card basket-card stack">
      <p className="error">No order data was changed. Retry the company-scoped request.</p>
      <div><button className="button" type="button" onClick={() => reset()}>Retry order history</button></div>
    </section>
  </section>;
}
