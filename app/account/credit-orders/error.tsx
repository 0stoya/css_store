"use client";

export default function CreditOrdersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="account-workspace-content stack">
    <header className="account-workspace-heading">
      <p className="eyebrow">Account</p>
      <h1>Credit orders unavailable</h1>
      <p className="muted">The current credit-order view could not be loaded safely.</p>
    </header>
    <section className="card basket-card stack">
      <p className="error">This view could not be loaded. An earlier PO or order action may still have been saved. Check its status before submitting anything again.</p>
      <div><button className="button" type="button" onClick={() => reset()}>Retry credit orders</button></div>
    </section>
  </section>;
}
