import { NextResponse } from "next/server";
import { getCustomerToken, setCustomerToken } from "@/lib/session";
import { setPunchOutBrowserToken } from "@/lib/punchout/browser-session";
import { getPunchOutConfig } from "@/lib/punchout/config";
import { clearLeasedPunchOutCart, verifyPunchOutCustomerToken } from "@/lib/punchout/customer-session";
import { assertPunchOutMagentoGraphQlReady, exchangePunchOutCustomerSession } from "@/lib/punchout/fluid-session";
import { PunchOutSessionStore } from "@/lib/punchout/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const PATTERN = /^[A-Za-z0-9_-]{43}$/;
function reply(status: number, message?: string) {
  return new NextResponse(message || null, { status, headers: {
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...(message ? {"Content-Type": "text/plain; charset=utf-8"} : {}),
  } });
}
export async function GET(_request: Request, {params}: {params: Promise<{token:string}>}) {
  let config;
  try { config = getPunchOutConfig(); } catch { return reply(503); }
  if (!config.enabled) return reply(404);
  const entry = (await params).token;
  if (!PATTERN.test(entry)) return reply(404);
  let db: PunchOutSessionStore;
  try { db = new PunchOutSessionStore(config.sessionDbPath); } catch { return reply(503); }
  let current;
  try {
    const pending = db.peekEntry(entry);
    const profile = config.profiles.find((p) => p.id === pending?.profileId);
    if (!pending || !profile || pending.companyId !== profile.companyId ||
        pending.storeCode !== profile.storeCode || !profile.customerIds.includes(pending.customerId)) return reply(410);
    // Preauthenticated is solely a local development bridge. Verify BEFORE consuming token.
    if (config.authMode === "preauthenticated") {
      const token = await getCustomerToken();
      if (!token) return reply(401, "Sign in as the dedicated test customer.");
      try { await verifyPunchOutCustomerToken(pending, token, {requireEmptyCart: true}); }
      catch { return reply(403, "The configured PunchOut test account/cart is not ready."); }
    }
    // Magento may be temporarily unable to compile its GraphQL schema.
    // Preserve the one-use StartPage token on a known preflight failure.
    // A later, ambiguous exchange failure still holds the customer lease.
    if (config.authMode === "fluid_exchange") {
      try { await assertPunchOutMagentoGraphQlReady(); }
      catch {
        return reply(503, "The purchasing service is unavailable. This StartPage link remains valid; please retry.");
      }
    }
    current = db.consumeEntryToken(entry);
  } catch {
    return reply(410);
  } finally {
    db.close();
  }
  if (!current) return reply(410);
  let customerToken = await getCustomerToken();
  if (config.authMode === "fluid_exchange") {
    try {
      customerToken = await exchangePunchOutCustomerSession(config, current.session);
      await verifyPunchOutCustomerToken(current.session, customerToken);
      // One principal can serve only one ACTIVE session, so reset any abandoned
      // previous quote now, after the authoritative lease and identity checks.
      await clearLeasedPunchOutCart(customerToken);
      await setCustomerToken(customerToken);
    } catch {
      return reply(503, "The PunchOut shopping session could not be established.");
    }
  }
  if (!customerToken) return reply(401);
  const maxAge = Math.max(1, Math.min(config.sessionTtlSeconds, Math.ceil((current.session.expiresAt - Date.now()) / 1000)));
  await setPunchOutBrowserToken(current.browserToken, maxAge);
  return new NextResponse(null, {status: 303, headers: {
    Location: "/catalogue", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  }});
}
