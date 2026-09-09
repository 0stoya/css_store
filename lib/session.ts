import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "css_store_customer";

export async function getCustomerToken() {
  return (await cookies()).get(COOKIE)?.value || null;
}

export async function requireCustomerToken() {
  const token = await getCustomerToken();
  if (!token) redirect("/login");
  return token;
}

export async function setCustomerToken(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearCustomerToken() {
  (await cookies()).delete(COOKIE);
}
