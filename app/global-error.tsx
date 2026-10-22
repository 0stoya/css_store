"use client";

// Covers failures in the root layout itself, where app/error.tsx cannot run.
// Keep this dependency-free and self-styled: root CSS may not be available.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reference = typeof error.digest === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(error.digest)
    ? error.digest
    : null;

  return <html lang="en">
    <body style={{ margin: 0, minHeight: "100vh", fontFamily: "Arial, Helvetica, sans-serif", background: "#f5f8fb", color: "#032541" }}>
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
        <section role="alert" aria-labelledby="global-error-heading" style={{ maxWidth: "540px", padding: "36px", border: "1px solid #d7e1ea", borderRadius: "18px", background: "white" }}>
          <p style={{ color: "#0060b8", fontWeight: 800, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Chelmsford Safety Supplies</p>
          <h1 id="global-error-heading">We couldn’t load the store</h1>
          <p style={{ lineHeight: 1.6, color: "#455d73" }}>Please try again. If the problem continues, contact support and provide the reference below.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "24px" }}>
            <button type="button" onClick={() => reset()} style={{ minHeight: "44px", padding: "10px 18px", border: 0, borderRadius: "9px", background: "#0060b8", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Try again</button>
            <a href="/catalogue" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "10px 18px", border: "1px solid #bdccd9", borderRadius: "9px", color: "#032541", fontWeight: 700, textDecoration: "none" }}>Browse products</a>
          </div>
          {reference ? <p style={{ marginTop: "22px", color: "#64778b", fontSize: "13px" }}>Support reference: <code>{reference}</code></p> : null}
        </section>
      </main>
    </body>
  </html>;
}
