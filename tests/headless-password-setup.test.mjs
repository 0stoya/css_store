import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("password setup is publicly accessible and uses a Magento reset token", () => {
  const page = source("app/reset-password/page.tsx");
  const form = source("app/reset-password/reset-password-form.tsx");
  assert.match(page, /reset-password-form/);
  assert.match(page, /no-referrer/);
  assert.match(page, /index: false/);
  assert.match(form, /resetPasswordToken/);
  assert.match(form, /autoComplete="new-password"/);
  assert.doesNotMatch(page, /requireCustomerToken/);
});

test("Magento owns password reset, with no customer ID or password in client URLs", () => {
  const action = source("app/reset-password/actions.ts");
  const auth = source("lib/magento/auth.ts");
  assert.match(action, /resetCustomerPassword/);
  assert.match(auth, /mutation StoreResetCustomerPassword/);
  assert.match(auth, /resetPassword\(/);
  assert.doesNotMatch(action, /console\.|logger\.|redirect\(/);
  assert.doesNotMatch(action, /createAccount|customerRepository|customer_id/);
});

test("password validation and explicit success/failure feedback are present", () => {
  const action = source("app/reset-password/actions.ts");
  const form = source("app/reset-password/reset-password-form.tsx");
  assert.match(action, /password !== confirmation/);
  assert.match(form, /state\.success/);
  assert.match(form, /state\.error/);
  assert.match(form, /pending/);
});
