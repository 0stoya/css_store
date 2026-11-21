import { createHmac } from "node:crypto";

/**
 * Only the server-side checkout order mutations receive a signed origin.
 * Never expose the shared key to the browser or sign arbitrary GraphQL calls.
 */
const ORDER_OPERATIONS = new Set(["StorePlaceOrder", "StoreSubmitCreditOrder"]);

export function orderChannelHeaders(operation: string, variables: Record<string, unknown>): Record<string, string> {
  if (!ORDER_OPERATIONS.has(operation) || process.env.CSS_STORE_ORDER_CHANNEL_ENABLED !== "1") {
    return {};
  }

  const cartId = variables.cartId;
  const key = process.env.CSS_STORE_ORDER_CHANNEL_SIGNING_KEY;
  if (typeof cartId !== "string" || !cartId || cartId.length > 512 || !key || key.length < 32) {
    // Never quietly place a headless checkout that might receive a Hyvä email.
    throw new Error("Headless email routing is enabled but its Magento order signature is not configured.");
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = `v1\n${operation}\n${cartId}\n${timestamp}`;
  const signature = createHmac("sha256", key).update(payload).digest("hex");

  return {
    "X-CSS-Order-Channel": "css_store",
    "X-CSS-Order-Timestamp": timestamp,
    "X-CSS-Order-Signature": signature,
  };
}
