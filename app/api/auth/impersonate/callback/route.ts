import { NextResponse, type NextRequest } from "next/server";
import {
  consumeAppSwitchState,
  consumeAppSwitchTarget,
  isAppSwitchValue,
} from "@/lib/app-switch-session";
import {
  exchangeCustomerAppSwitch,
  getCustomerAppSwitchContext,
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

  if (!isAppSwitchValue(code) || !verifier || !target) {
    console.warn("[impersonation] callback preflight failed", {
      code: isAppSwitchValue(code),
      verifier: Boolean(verifier),
      target: Boolean(target),
    });
    return loginFailure();
  }

  let token: string | null = null;
  try {
    token = await exchangeCustomerAppSwitch(code, "STORE", verifier);
    const context = await getCustomerAppSwitchContext(token);
    const matches = context.authenticated
      && context.isCompanyCustomer
      && Boolean(context.email)
      && context.selectedCompanyId === target.companyId
      && context.selectedCompanyUserId === target.userId;

    if (!matches) {
      console.warn("[impersonation] exchanged customer context mismatch", {
        expectedCompanyId: target.companyId,
        actualCompanyId: context.selectedCompanyId,
        expectedCompanyUserId: target.userId,
        actualCompanyUserId: context.selectedCompanyUserId,
        authenticated: context.authenticated,
        isCompanyCustomer: context.isCompanyCustomer,
      });
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
  } catch (error) {
    console.warn("[impersonation] callback failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    if (token) await revokeCustomerToken(token);
    return loginFailure();
  }
}
