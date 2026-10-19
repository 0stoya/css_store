import { cookies } from "next/headers";

const COOKIE = "css_store_employee_delivery_review";
const MAX_AGE = 60 * 60 * 8;

function options() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };
}

// A changed Employee requires an explicit native shipping address selection
// unless their currently-owned saved address is applied successfully.
export async function markEmployeeDeliveryReviewPending(cartId: string) {
  if (!cartId) throw new Error("Missing Magento cart ID.");
  (await cookies()).set(COOKIE, cartId, options());
}

export async function isEmployeeDeliveryReviewPending(cartId: string) {
  return Boolean(cartId) && (await cookies()).get(COOKIE)?.value === cartId;
}

export async function clearEmployeeDeliveryReview() {
  (await cookies()).set(COOKIE, "", { ...options(), maxAge: 0 });
}

export async function assertEmployeeDeliveryReviewComplete(cartId: string) {
  if (await isEmployeeDeliveryReviewPending(cartId)) {
    throw new Error("Please confirm a delivery address for the selected Employee before continuing.");
  }
}
