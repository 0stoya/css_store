import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCustomerToken } from "@/lib/session";
import { getCustomerCart } from "@/lib/magento/cart";
import { getActivePunchOutSession } from "@/lib/punchout/active-session";
import { verifyPunchOutCustomerToken } from "@/lib/punchout/customer-session";
import { buildPunchOutOrderMessage } from "@/lib/punchout/order-message";
import { validateBrowserFormPost } from "@/lib/punchout/security";
import { PunchOutSessionStore } from "@/lib/punchout/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function htmlEscape(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function failure(status: number, message: string) {
  return new NextResponse(message, { status, headers: {
    "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  } });
}
export async function POST(request: NextRequest) {
  let current;
  try { current = await getActivePunchOutSession(); }
  catch { return failure(503, "PunchOut is temporarily unavailable."); }
  if (!current) return failure(403, "Your PunchOut session is no longer active.");
  const { config, profile, session, browserToken } = current;
  if (request.headers.get("origin") !== config.storeOrigin) return failure(403, "Untrusted PunchOut return request.");
  const token = await getCustomerToken();
  if (!token) return failure(401, "PunchOut login has expired.");
  try {
    await verifyPunchOutCustomerToken(session, token);
    const cart = await getCustomerCart(token);
    const callback = validateBrowserFormPost(session.browserFormPost, profile.allowedReturnHosts);
    const payload = buildPunchOutOrderMessage({
      cart, session, profile, payloadId: randomUUID() + "@css-store",
      timestamp: new Date().toISOString(),
    });
    // Consume return exactly once. Do not create any Magento/Fluid order.
    const db = new PunchOutSessionStore(config.sessionDbPath);
    try { db.markReturned(browserToken); } finally { db.close(); }
    const url = new URL(callback);
    const encoded = profile.browserFormField === "cXML-base64" ? Buffer.from(payload, "utf8").toString("base64") : payload;
    const page = [
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
      "<meta name=\"referrer\" content=\"no-referrer\"><title>Return to purchasing</title></head><body>",
      "<main><h1>Returning your basket</h1>",
      '<form method="POST" action="' + htmlEscape(callback) + '">',
      '<input type="hidden" name="' + htmlEscape(profile.browserFormField) + '" value="' + htmlEscape(encoded) + '">',
      '<button type="submit">Continue to purchasing system</button></form></main>',
      "<script>document.forms[0].submit();</script></body></html>",
    ].join("");
    return new NextResponse(page, {status: 200, headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action " + url.origin +
        "; script-src 'unsafe-inline'",
    }});
  } catch {
    return failure(422, "This basket cannot be returned until the buyer's product, price and purchasing rules are satisfied.");
  }
}
