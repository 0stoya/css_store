export default function AccountLoading() {
  return <section className="account-workspace-content stack" aria-busy="true" aria-live="polite">
    <header className="account-workspace-heading">
      <p className="eyebrow">Account</p>
      <h1>Loading…</h1>
      <p className="muted">Loading this account section.</p>
    </header>
    <section className="card basket-card account-route-loading-card">
      <div className="account-route-loading-line account-route-loading-line-wide"/>
      <div className="account-route-loading-line"/>
      <div className="account-route-loading-line account-route-loading-line-short"/>
    </section>
  </section>;
}
