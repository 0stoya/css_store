import { NextResponse } from "next/server";
import { getCustomerToken, setCustomerToken } from "@/lib/session";
import { setPunchOutBrowserToken } from "@/lib/punchout/browser-session";
import { getPunchOutConfig, type PunchOutConfig } from "@/lib/punchout/config";
import { verifyPunchOutCustomerToken } from "@/lib/punchout/customer-session";
import { exchangePunchOutCustomerSession } from "@/lib/punchout/fluid-session";
import { PunchOutSessionStore } from "@/lib/punchout/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function response(status: number, message?: string) {
  return new NextResponse(message || null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...(message ? { "Content-Type": "text/plain; charset=utf-8" } : {}),
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  let config: PunchOutConfig;
  try {
    config = getPunchOutConfig();
  } catch {
    return response(503, "PunchOut is unavailable.");
  }
  if (!config.enabled) return response(404);

  const entryToken = (await params).token;
  if (!TOKEN_PATTERN.test(entryToken)) return response(404);

  let customerToken: string | null = null;

  // Development bridge only: prove the existing login is exactly the configured
  // PunchOut principal before consuming the one-use StartPage token.
  if (config.authMode === "preauthenticated") {
    customerToken = await getCustomerToken();
    if (!customerToken) {
      return response(
        401,
        "PunchOut development mode requires you to sign in as the configured PunchOut test customer before opening the StartPage URL.",
      );
    }
    try {
      await verifyPunchOutCustomerToken(config, customerToken, { requireEmptyCart: true });
    } catch {
      return response(
        403,
        "The current storefront login is not the configured empty PunchOut customer/company session.",
      );
    }
  }

  let store: PunchOutSessionStore;
  try {
    store = new PunchOutSessionStore(config.sessionDbPath);
  } catch {
    return response(503, "PunchOut session storage is unavailable.");
  }

  let active: ReturnType<PunchOutSessionStore["consumeEntryToken"]>;
  try {
    active = store.consumeEntryToken(entryToken);
  } catch {
    return response(410, "This PunchOut StartPage token is invalid, expired or already used.");
  } finally {
    store.close();
  }

  if (
    active.session.customerId !== config.magentoCustomerId
    || active.session.companyId !== config.companyId
    || active.session.storeCode !== config.storeCode
  ) {
    return response(403, "The PunchOut session principal does not match configuration.");
  }

  if (config.authMode === "fluid_exchange") {
    try {
      customerToken = await exchangePunchOutCustomerSession(config);
      await verifyPunchOutCustomerToken(config, customerToken, { requireEmptyCart: true });
      await setCustomerToken(customerToken);
    } catch {
      return response(503, "The PunchOut customer session could not be established.");
    }
  }

  if (!customerToken) {
    return response(503, "The PunchOut customer session could not be established.");
  }

  const maxAge = Math.max(
    1,
    Math.min(
      config.sessionTtlSeconds,
      Math.ceil((active.session.expiresAt - Date.now()) / 1000),
    ),
  );
  await setPunchOutBrowserToken(active.browserToken, maxAge);

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/catalogue",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
