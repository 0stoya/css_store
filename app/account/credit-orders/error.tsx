"use client";

export default function CreditOrdersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="shell stack">
    <div className="basket-heading">
      <div>
        <p className="eyebrow">Customer account · credit orders</p>
        <h1>Credit orders unavailable</h1>
        <p className="muted">The current Fluid credit-order view could not be loaded safely.</p>
      </div>
    </div>
    <section className="card basket-card stack">
      <p className="error">No credit-order action has been performed. Retry before continuing.</p>
      <div><button className="button" type="button" onClick={() => reset()}>Retry credit orders</button></div>
    </section>
  </main>;
}
