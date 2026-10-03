import { NextResponse } from "next/server";
import { getAdminPortalUrl } from "@/lib/config";
import { revokeCustomerToken } from "@/lib/magento/auth";
import { clearCustomerToken, getCustomerToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const token = await getCustomerToken();
  if (token) await revokeCustomerToken(token);
  await clearCustomerToken();

  const response = NextResponse.redirect(new URL("/companies", getAdminPortalUrl()), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
