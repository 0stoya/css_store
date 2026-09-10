"use client";

import Link from "next/link";

export default function DeliveryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="shell">
    <section className="card delivery-card stack">
      <p className="eyebrow">Checkout · delivery</p>
      <h1>Delivery options are unavailable</h1>
      <p className="muted">The current basket or Magento delivery state could not be loaded.</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button className="button" type="button" onClick={() => reset()}>Try again</button>
        <Link className="button secondary" href="/basket">Back to basket</Link>
      </div>
    </section>
  </main>;
}
