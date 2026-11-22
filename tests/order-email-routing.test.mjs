import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relative) { return readFileSync(new URL("../" + relative, import.meta.url), "utf8"); }

test("only order placement and credit submit are signed, behind the OFF-by-default flag", () => {
  const text = read("lib/magento/order-channel.ts");
  assert.match(text, /StorePlaceOrder/);
  assert.match(text, /StoreSubmitCreditOrder/);
  assert.match(text, /CSS_STORE_ORDER_CHANNEL_ENABLED !== "1"/);
  assert.match(text, /createHmac\("sha256"/);
  assert.doesNotMatch(text, /NEXT_PUBLIC_/);
});

test("Magento GraphQL adds order channel headers only server-side and does not expose its key", () => {
  const text = read("lib/magento/client.ts");
  assert.match(text, /orderChannelHeaders\(operation, variables\)/);
  assert.doesNotMatch(text, /X-CSS-Order-Signature.*NEXT_PUBLIC_/);
});

test("missing signing key blocks a flagged headless order rather than reverting to Hyvä email", () => {
  const text = read("lib/magento/order-channel.ts");
  assert.match(text, /key\.length < 32/);
  assert.match(text, /throw new Error/);
});
