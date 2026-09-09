import Link from "next/link";
import { getStoreName } from "@/lib/config";

export function SiteHeader({ customerName, companyName }: { customerName?: string; companyName?: string | null }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/">{getStoreName()}</Link>
      <nav aria-label="Store navigation">
        <Link href="/catalogue">Products</Link>
        {customerName ? <Link href="/account">Account</Link> : <Link href="/login">Sign in</Link>}
      </nav>
      {customerName ? <div className="identity"><strong>{customerName}</strong><span>{companyName || "No company selected"}</span></div> : null}
    </header>
  );
}
