import { NextResponse, type NextRequest } from "next/server";
import { beginAppSwitch, rememberAppSwitchTarget } from "@/lib/app-switch-session";
import { getAdminPortalUrl } from "@/lib/config";
import { clearCustomerToken } from "@/lib/session";

export const dynamic = "force-dynamic";

const COOKIE_PATH = "/api/auth/impersonate";

function positiveInteger(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function localFailure() {
  const params = new URLSearchParams({
    error: "The admin support session request was invalid.",
  });
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/login?${params.toString()}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest) {
  const companyId = positiveInteger(request.nextUrl.searchParams.get("companyId"));
  const userId = positiveInteger(request.nextUrl.searchParams.get("userId"));
  if (!companyId || !userId) return localFailure();

  // Replace only this browser's Store session. Magento's customer-token revocation is
  // customer-wide and would invalidate the customer's other legitimate sessions.
  await clearCustomerToken();

  await rememberAppSwitchTarget(companyId, userId, COOKIE_PATH);
  const { state, challenge } = await beginAppSwitch(COOKIE_PATH);
  const authorizeUrl = new URL("/api/auth/impersonate/authorize", getAdminPortalUrl());
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("companyId", String(companyId));
  authorizeUrl.searchParams.set("userId", String(userId));

  const response = NextResponse.redirect(authorizeUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
