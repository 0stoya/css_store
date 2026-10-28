import { NextResponse } from "next/server";
import { beginAppSwitch } from "@/lib/app-switch-session";
import { getAdminPortalUrl } from "@/lib/config";
import { assertNormalCheckoutSession } from "@/lib/punchout/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await assertNormalCheckoutSession(); }
  catch { return new NextResponse(null, { status: 403, headers: {"Cache-Control":"no-store"} }); }
  const { state, challenge } = await beginAppSwitch();
  const authorizeUrl = new URL("/api/auth/sso/authorize", getAdminPortalUrl());
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);

  const response = NextResponse.redirect(authorizeUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
