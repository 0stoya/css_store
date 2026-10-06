import { cookies } from "next/headers";

const COOKIE = "css_store_punchout";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function getPunchOutBrowserToken() {
  const value = (await cookies()).get(COOKIE)?.value || null;
  return value && TOKEN_PATTERN.test(value) ? value : null;
}
export async function setPunchOutBrowserToken(token: string, maxAgeSeconds: number) {
  if (!TOKEN_PATTERN.test(token)) throw new Error("Invalid PunchOut browser token.");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: maxAgeSeconds,
  });
}
export async function clearPunchOutBrowserToken() { (await cookies()).delete(COOKIE); }
export async function assertNormalCheckoutSession() {
  if (await getPunchOutBrowserToken()) {
    throw new Error("This PunchOut basket must be returned to SAP instead of placed in the storefront.");
  }
}
