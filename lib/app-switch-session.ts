import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const STATE_COOKIE = "css_app_switch_state";
const VERIFIER_COOKIE = "css_app_switch_verifier";
const COOKIE_PATH = "/api/auth/sso";
const VALUE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

function transientCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: 120,
  };
}

export function isAppSwitchValue(value: string | null): value is string {
  return typeof value === "string" && VALUE_PATTERN.test(value);
}

export async function beginAppSwitch() {
  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const store = await cookies();
  store.set(STATE_COOKIE, state, transientCookieOptions());
  store.set(VERIFIER_COOKIE, verifier, transientCookieOptions());
  return { state, challenge };
}

export async function consumeAppSwitchState(receivedState: string | null) {
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value ?? null;
  const verifier = store.get(VERIFIER_COOKIE)?.value ?? null;
  const expired = { ...transientCookieOptions(), maxAge: 0 };
  store.set(STATE_COOKIE, "", expired);
  store.set(VERIFIER_COOKIE, "", expired);

  if (
    !isAppSwitchValue(receivedState)
    || !isAppSwitchValue(expectedState)
    || !isAppSwitchValue(verifier)
  ) {
    return null;
  }

  const received = Buffer.from(receivedState);
  const expected = Buffer.from(expectedState);
  return received.length === expected.length && timingSafeEqual(received, expected)
    ? verifier
    : null;
}
