"use client";

export default function BasketError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="shell">
    <div className="basket-heading">
      <div>
        <p className="eyebrow">Company basket</p>
        <h1>Basket unavailable</h1>
        <p className="muted">The current Magento basket could not be loaded safely.</p>
      </div>
    </div>
    <section className="card basket-card stack">
      <p className="error">Your basket was not changed. Retry the request before continuing.</p>
      <div><button className="button" type="button" onClick={() => reset()}>Retry basket</button></div>
    </section>
  </main>;
}
