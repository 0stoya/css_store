import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const STATE_COOKIE = "css_app_switch_state";
const VERIFIER_COOKIE = "css_app_switch_verifier";
const TARGET_COOKIE = "css_app_switch_target";
const DEFAULT_COOKIE_PATH = "/api/auth/sso";
const VALUE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TARGET_PATTERN = /^(\d+):(\d+)$/;

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

function transientCookieOptions(cookiePath: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: cookiePath,
    maxAge: 120,
  };
}

export function isAppSwitchValue(value: string | null): value is string {
  return typeof value === "string" && VALUE_PATTERN.test(value);
}

export async function beginAppSwitch(cookiePath = DEFAULT_COOKIE_PATH) {
  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const store = await cookies();
  store.set(STATE_COOKIE, state, transientCookieOptions(cookiePath));
  store.set(VERIFIER_COOKIE, verifier, transientCookieOptions(cookiePath));
  return { state, challenge };
}

export async function rememberAppSwitchTarget(
  companyId: number,
  userId: number,
  cookiePath = DEFAULT_COOKIE_PATH,
) {
  if (
    !Number.isInteger(companyId)
    || companyId <= 0
    || !Number.isInteger(userId)
    || userId <= 0
  ) {
    throw new Error("A valid app-switch target is required.");
  }

  const store = await cookies();
  store.set(TARGET_COOKIE, `${companyId}:${userId}`, transientCookieOptions(cookiePath));
}

export async function consumeAppSwitchTarget(cookiePath = DEFAULT_COOKIE_PATH) {
  const store = await cookies();
  const rawTarget = store.get(TARGET_COOKIE)?.value ?? "";
  const expired = { ...transientCookieOptions(cookiePath), maxAge: 0 };
  store.set(TARGET_COOKIE, "", expired);

  const match = TARGET_PATTERN.exec(rawTarget);
  if (!match) return null;

  const companyId = Number(match[1]);
  const userId = Number(match[2]);
  if (
    !Number.isInteger(companyId)
    || companyId <= 0
    || !Number.isInteger(userId)
    || userId <= 0
  ) {
    return null;
  }

  return { companyId, userId };
}

export async function consumeAppSwitchState(
  receivedState: string | null,
  cookiePath = DEFAULT_COOKIE_PATH,
) {
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value ?? null;
  const verifier = store.get(VERIFIER_COOKIE)?.value ?? null;
  const expired = { ...transientCookieOptions(cookiePath), maxAge: 0 };
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
