import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./accessibility.css";
import { getStoreName } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: getStoreName(), template: `%s | ${getStoreName()}` },
  description: "Chelmsford Safety Supplies customer storefront",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
