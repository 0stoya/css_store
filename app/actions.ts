"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { clearCustomerToken, getCustomerToken, requireCustomerToken } from "@/lib/session";
import { revokeCustomerToken } from "@/lib/magento/auth";
import { cartHasItems, getCustomerCartSummary, type CartSummarySnapshot } from "@/lib/magento/cart";
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

  let cart: CartSummarySnapshot;
  try {
    cart = await getCustomerCartSummary(token);
  } catch (error) {
    unstable_rethrow(error);
    redirect("/account?error=Company%20selection%20is%20temporarily%20unavailable%20because%20the%20basket%20could%20not%20be%20verified.");
  }

  if (cartHasItems(cart)) {
    redirect("/account?error=Empty%20your%20basket%20before%20switching%20company.%20This%20prevents%20items%2C%20pricing%20or%20Employee%20attribution%20from%20crossing%20company%20contexts.");
  }

  try {
    await selectCompany(token, companyId);
  } catch (error) {
    unstable_rethrow(error);
    redirect("/account?error=Company%20selection%20failed.");
  }

  revalidatePath("/account", "layout");
  redirect("/account?notice=Company%20updated.");
}
