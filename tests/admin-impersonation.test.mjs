import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (file) => readFileSync(path.join(root, file), "utf8");

test("Shop starts admin impersonation with Shop-owned PKCE state", () => {
  const start = source("app/api/auth/impersonate/start/route.ts");
  const session = source("lib/app-switch-session.ts");

  assert.match(start, /beginAppSwitch\(COOKIE_PATH\)/);
  assert.match(start, /\/api\/auth\/impersonate\/authorize/);
  assert.match(start, /code_challenge/);
  assert.match(start, /companyId/);
  assert.match(start, /userId/);
  assert.match(session, /cookiePath = DEFAULT_COOKIE_PATH/);
  assert.doesNotMatch(start, /customer_token/i);
});

test("Shop consumes one-time app switch code into the normal customer session", () => {
  const callback = source("app/api/auth/impersonate/callback/route.ts");
  const session = source("lib/session.ts");

  assert.match(callback, /consumeAppSwitchState[\s\S]*COOKIE_PATH/);
  assert.match(callback, /exchangeCustomerAppSwitch\(code, "STORE", verifier\)/);
  assert.match(callback, /validateCompanyCustomerToken\(token\)/);
  assert.match(callback, /setCustomerToken\(token\)/);
  assert.match(callback, /setCustomerImpersonation\(\)/);
  assert.match(session, /css_store_customer/);
  assert.match(session, /css_store_impersonation/);
  assert.match(session, /httpOnly: true/);
});

test("admin support sessions are visible and can be exited", () => {
  const layout = source("app/layout.tsx");
  const exit = source("app/api/auth/impersonate/exit/route.ts");

  assert.match(layout, /Admin support session/);
  assert.match(layout, /\/api\/auth\/impersonate\/exit/);
  assert.match(exit, /revokeCustomerToken/);
  assert.match(exit, /clearCustomerToken/);
  assert.match(exit, /getAdminPortalUrl/);
});
