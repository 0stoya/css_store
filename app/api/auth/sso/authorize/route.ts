import { NextResponse, type NextRequest } from "next/server";
import { isAppSwitchValue } from "@/lib/app-switch-session";
import { getAdminPortalUrl } from "@/lib/config";
import { createCustomerAppSwitch } from "@/lib/magento/app-switch";
import { getCustomerToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function redirect(url: URL) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function localRedirect(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const challenge = request.nextUrl.searchParams.get("code_challenge");
  const token = await getCustomerToken();

  if (!token) {
    return localRedirect("/login?error=Your%20session%20expired.%20Please%20sign%20in%20again.");
  }
  if (!isAppSwitchValue(state) || !isAppSwitchValue(challenge)) {
    return localRedirect("/account?error=The%20Manage%20switch%20request%20was%20invalid.");
  }

  try {
    const code = await createCustomerAppSwitch(token, "PORTAL", challenge);
    const callbackUrl = new URL("/api/auth/sso/callback", getAdminPortalUrl());
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);
    return redirect(callbackUrl);
  } catch {
    return localRedirect("/account?error=Manage%20is%20temporarily%20unavailable.");
  }
}
