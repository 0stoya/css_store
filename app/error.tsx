"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw, ShoppingBag } from "lucide-react";

function supportReference(error: Error & { digest?: string }) {
  const digest = error.digest;
  return typeof digest === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(digest)
    ? digest
    : null;
}

// Next.js strips Server Component error details in production. Do not expose
// error.message: it can contain backend or customer information on client errors.
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reference = supportReference(error);

  return <main className="shell store-error-page">
    <section className="card store-error-card" role="alert" aria-labelledby="store-error-heading">
      <span className="store-error-symbol"><AlertTriangle size={25} aria-hidden="true"/></span>
      <p className="eyebrow">Chelmsford Safety Supplies</p>
      <h1 id="store-error-heading">We couldn’t load this page</h1>
      <p className="store-error-description">
        Something interrupted the store. Try again, or return to the products catalogue.
        If it keeps happening, contact support.
      </p>
      <div className="store-error-actions">
        <button type="button" className="button" onClick={() => reset()}>
          <RotateCcw size={17} aria-hidden="true"/> Try again
        </button>
        <Link className="button secondary" href="/catalogue">
          <ShoppingBag size={17} aria-hidden="true"/> Browse products
        </Link>
      </div>
      {reference ? <p className="store-error-reference">Support reference: <code>{reference}</code></p> : null}
    </section>
  </main>;
}
