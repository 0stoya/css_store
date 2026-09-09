"use server";

import { redirect } from "next/navigation";
import { clearCustomerToken, getCustomerToken, requireCustomerToken } from "@/lib/session";
import { revokeCustomerToken } from "@/lib/magento/auth";
import { selectCompany } from "@/lib/magento/context";

export async function logoutAction() {
  const token = await getCustomerToken();
  if (token) await revokeCustomerToken(token);
  await clearCustomerToken();
  redirect("/login");
}

export async function selectCompanyAction(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  if (!Number.isInteger(companyId) || companyId <= 0) redirect("/account?error=Invalid%20company.");
  const token = await requireCustomerToken();
  try { await selectCompany(token, companyId); } catch { redirect("/account?error=Company%20selection%20failed."); }
  redirect("/account?notice=Company%20updated.");
}
