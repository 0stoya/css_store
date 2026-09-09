"use server";

import { redirect } from "next/navigation";
import { loginCustomer } from "@/lib/magento/auth";
import { getCustomerContext } from "@/lib/magento/context";
import { setCustomerToken } from "@/lib/session";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) redirect("/login?error=Enter%20your%20email%20and%20password.");
  try {
    const token = await loginCustomer(email, password);
    const context = await getCustomerContext(token);
    if (!context.css_company_context.authenticated) throw new Error("Customer context was not authenticated.");
    await setCustomerToken(token);
  } catch {
    redirect("/login?error=Email%20address%20or%20password%20was%20not%20recognised.");
  }
  redirect("/");
}
