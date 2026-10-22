import Link from "next/link";
import { PackageSearch } from "lucide-react";

// Used for unknown routes and unavailable/hidden product SKUs. Do not disclose
// whether a specific product exists outside the customer's allowed catalogue.
export default function NotFound() {
  return <main className="shell store-error-page">
    <section className="card store-error-card" aria-labelledby="store-not-found-heading">
      <span className="store-error-symbol"><PackageSearch size={26} aria-hidden="true"/></span>
      <p className="eyebrow">Chelmsford Safety Supplies</p>
      <h1 id="store-not-found-heading">We couldn’t find that page</h1>
      <p className="store-error-description">
        The page may have moved, or the product may not be available in your catalogue.
      </p>
      <div className="store-error-actions">
        <Link className="button" href="/catalogue">Browse products</Link>
      </div>
    </section>
  </main>;
}
