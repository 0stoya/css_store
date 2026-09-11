"use client";

export default function CreditOrdersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="account-workspace-content stack">
    <header className="account-workspace-heading">
      <p className="eyebrow">Account</p>
      <h1>Credit orders unavailable</h1>
      <p className="muted">The current credit-order view could not be loaded safely.</p>
    </header>
    <section className="card basket-card stack">
      <p className="error">No credit-order action has been performed. Retry before continuing.</p>
      <div><button className="button" type="button" onClick={() => reset()}>Retry credit orders</button></div>
    </section>
  </section>;
}
