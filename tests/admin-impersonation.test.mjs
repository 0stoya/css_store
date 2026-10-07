import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (file) => readFileSync(path.join(root, file), "utf8");

test("Shop starts admin impersonation with Shop-owned PKCE state", () => {
  const start = source("app/api/auth/impersonate/start/route.ts");
  const appSwitchSession = source("lib/app-switch-session.ts");

  assert.match(start, /beginAppSwitch\(COOKIE_PATH\)/);
  assert.match(start, /rememberAppSwitchTarget\(companyId, userId, COOKIE_PATH\)/);
  assert.match(start, /\/api\/auth\/impersonate\/authorize/);
  assert.match(start, /code_challenge/);
  assert.match(start, /companyId/);
  assert.match(start, /userId/);
  assert.match(appSwitchSession, /css_app_switch_target/);
  assert.match(appSwitchSession, /cookiePath = DEFAULT_COOKIE_PATH/);
  assert.doesNotMatch(start, /customer_token/i);
});

test("starting a new support session replaces only the local Store browser session", () => {
  const start = source("app/api/auth/impersonate/start/route.ts");

  assert.match(start, /clearCustomerToken\(\)/);
  assert.doesNotMatch(start, /revokeCustomerToken/);
  assert.doesNotMatch(start, /getCustomerToken\(\)/);
  assert.match(
    start,
    /clearCustomerToken\(\)[\s\S]*rememberAppSwitchTarget\(companyId, userId, COOKIE_PATH\)/,
  );
});

test("Shop consumes one-time app switch code into the exact requested company user session", () => {
  const callback = source("app/api/auth/impersonate/callback/route.ts");
  const appSwitch = source("lib/magento/app-switch.ts");
  const session = source("lib/session.ts");

  assert.match(callback, /consumeAppSwitchState[\s\S]*COOKIE_PATH/);
  assert.match(callback, /consumeAppSwitchTarget\(COOKIE_PATH\)/);
  assert.match(callback, /exchangeCustomerAppSwitch\(code, "STORE", verifier\)/);
  assert.match(callback, /getCustomerAppSwitchContext\(token\)/);
  assert.match(callback, /context\.selectedCompanyId === target\.companyId/);
  assert.match(callback, /context\.selectedCompanyUserId === target\.userId/);
  assert.doesNotMatch(callback, /revokeCustomerToken/);
  assert.match(callback, /stage = "exchange"/);
  assert.match(callback, /stage = "context"/);
  assert.match(callback, /stage = "session"/);
  assert.match(callback, /\[impersonation\] callback preflight failed/);
  assert.match(callback, /\[impersonation\] exchanged customer context mismatch/);
  assert.match(callback, /\[impersonation\] callback failed/);
  assert.match(appSwitch, /selected_company_id/);
  assert.match(appSwitch, /selected_company_user_id/);
  assert.match(appSwitch, /selectedCompanyUserId/);
  assert.match(callback, /setCustomerToken\(token\)/);
  assert.match(callback, /setCustomerImpersonation\(\)/);
  assert.match(session, /css_store_customer/);
  assert.match(session, /css_store_impersonation/);
  assert.match(session, /httpOnly: true/);
});

test("admin support sessions are visible and exit without customer-wide token revocation", () => {
  const layout = source("app/layout.tsx");
  const exit = source("app/api/auth/impersonate/exit/route.ts");

  assert.match(layout, /Admin support session/);
  assert.match(layout, /\/api\/auth\/impersonate\/exit/);
  assert.match(exit, /clearCustomerToken/);
  assert.doesNotMatch(exit, /revokeCustomerToken/);
  assert.doesNotMatch(exit, /getCustomerToken/);
  assert.match(exit, /getAdminPortalUrl/);
});
