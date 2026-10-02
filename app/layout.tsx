import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./accessibility.css";
import "./portal-ux.css";
import "./production-fixes.css";
import "./mega-menu.css";
import "./icon-system.css";
import "./pdp.css";
import "./pdp-simplified.css";
import "./pdp-runtime-tuning.css";
import "./configurable-product.css";
import "./product-badges.css";
import "./basket-ux.css";
import "./delivery-ux.css";
import "./payment-ux.css";
import "./checkout-polish.css";
import "./account-ux.css";
import "./account-sidebar.css";
import "./portal-width.css";
import "./catalogue-ux.css";
import "./catalogue-polish.css";
import "./header-search.css";
import "./home-catalogue.css";
import "./impersonation.css";
import { SiteFooter } from "@/components/site-footer";
import { getStoreName } from "@/lib/config";
import { isCustomerImpersonation } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: getStoreName(), template: `%s | ${getStoreName()}` },
  description: "Chelmsford Safety Supplies customer portal",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const impersonating = await isCustomerImpersonation();

  return <html lang="en"><body className={impersonating ? "support-session-active" : undefined}>
    {impersonating ? (
      <aside className="impersonation-banner" role="status" aria-label="Admin support session">
        <span><strong>Admin support session</strong> · You are shopping as a customer.</span>
        <form action="/api/auth/impersonate/exit" method="post">
          <button type="submit">Exit support session</button>
        </form>
      </aside>
    ) : null}
    {children}
    <SiteFooter/>
  </body></html>;
}
