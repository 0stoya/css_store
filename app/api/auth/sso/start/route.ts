import { NextResponse } from "next/server";
import { beginAppSwitch } from "@/lib/app-switch-session";
import { getAdminPortalUrl } from "@/lib/config";
import { getPunchOutBrowserToken } from "@/lib/punchout/browser-session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (await getPunchOutBrowserToken()) {
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/account?error=PunchOut%20sessions%20cannot%20switch%20applications.",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  const { state, challenge } = await beginAppSwitch();
  const authorizeUrl = new URL("/api/auth/sso/authorize", getAdminPortalUrl());
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);

  const response = NextResponse.redirect(authorizeUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
