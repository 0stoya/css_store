import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./accessibility.css";
import "./portal-ux.css";
import "./production-fixes.css";
import "./icon-system.css";
import "./pdp.css";
import "./pdp-simplified.css";
import "./pdp-runtime-tuning.css";
import "./basket-ux.css";
import "./delivery-ux.css";
import "./payment-ux.css";
import "./account-ux.css";
import "./account-sidebar.css";
import { SiteFooter } from "@/components/site-footer";
import { getStoreName } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: getStoreName(), template: `%s | ${getStoreName()}` },
  description: "Chelmsford Safety Supplies customer portal",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}<SiteFooter/></body></html>;
}
