import { NextResponse, type NextRequest } from "next/server";
import {
  consumeAppSwitchState,
  consumeAppSwitchTarget,
  isAppSwitchValue,
} from "@/lib/app-switch-session";
import {
  exchangeCustomerAppSwitch,
  validateCompanyCustomerToken,
} from "@/lib/magento/app-switch";
import { revokeCustomerToken } from "@/lib/magento/auth";
import { setCustomerImpersonation, setCustomerToken } from "@/lib/session";

export const dynamic = "force-dynamic";

const COOKIE_PATH = "/api/auth/impersonate";

function loginFailure() {
  const params = new URLSearchParams({
    error: "The secure admin support session expired or could not be verified.",
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
  const code = request.nextUrl.searchParams.get("code");
  const verifier = await consumeAppSwitchState(
    request.nextUrl.searchParams.get("state"),
    COOKIE_PATH,
  );
  const target = await consumeAppSwitchTarget(COOKIE_PATH);
  if (!isAppSwitchValue(code) || !verifier || !target) return loginFailure();

  let token: string | null = null;
  try {
    token = await exchangeCustomerAppSwitch(code, "STORE", verifier);
    if (
      !(await validateCompanyCustomerToken(
        token,
        target.companyId,
        target.userId,
      ))
    ) {
      await revokeCustomerToken(token);
      return loginFailure();
    }

    await setCustomerToken(token);
    await setCustomerImpersonation();

    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    if (token) await revokeCustomerToken(token);
    return loginFailure();
  }
}
