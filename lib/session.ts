import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "css_store_customer";
const IMPERSONATION_COOKIE = "css_store_impersonation";
const SESSION_SECONDS = 60 * 60 * 8;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

export async function getCustomerToken() {
  return (await cookies()).get(COOKIE)?.value || null;
}

export async function requireCustomerToken() {
  const token = await getCustomerToken();
  if (!token) redirect("/login");
  return token;
}

export async function isCustomerImpersonation() {
  return (await cookies()).get(IMPERSONATION_COOKIE)?.value === "1";
}

export async function setCustomerToken(token: string) {
  const store = await cookies();
  store.set(COOKIE, token, cookieOptions());
  store.set(IMPERSONATION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

export async function setCustomerImpersonation() {
  (await cookies()).set(IMPERSONATION_COOKIE, "1", cookieOptions());
}

export async function clearCustomerToken() {
  const store = await cookies();
  store.set(COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  store.set(IMPERSONATION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}
