import { NextResponse, type NextRequest } from "next/server";
import { consumeAppSwitchState, isAppSwitchValue } from "@/lib/app-switch-session";
import {
  exchangeCustomerAppSwitch,
  validateCompanyCustomerToken,
} from "@/lib/magento/app-switch";
import { setCustomerToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function loginFailure() {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/login?error=The%20secure%20app%20switch%20expired%20or%20could%20not%20be%20verified.%20Sign%20in%20to%20continue.",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const verifier = await consumeAppSwitchState(request.nextUrl.searchParams.get("state"));
  if (!isAppSwitchValue(code) || !verifier) return loginFailure();

  try {
    const token = await exchangeCustomerAppSwitch(code, "STORE", verifier);
    if (!(await validateCompanyCustomerToken(token))) return loginFailure();
    await setCustomerToken(token);
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return loginFailure();
  }
}
