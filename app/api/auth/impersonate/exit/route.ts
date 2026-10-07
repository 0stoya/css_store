import { NextResponse } from "next/server";
import { getAdminPortalUrl } from "@/lib/config";
import { clearCustomerToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  // Clear only the Store browser session. Magento customer-token revocation is
  // customer-wide and must not log the real customer out of other sessions.
  await clearCustomerToken();

  const response = NextResponse.redirect(new URL("/companies", getAdminPortalUrl()), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
