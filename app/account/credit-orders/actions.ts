"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import {
  addCreditOrderComment,
  getCreditOrder,
  performCreditOrderAction,
  setCreditOrderPurchaseOrderNumber,
} from "@/lib/magento/credit-orders";
import { requireCustomerToken } from "@/lib/session";

function detailRedirect(number: string, kind: "error" | "notice", message: string): never {
  redirect(`/account/credit-orders/${encodeURIComponent(number)}?${kind}=${encodeURIComponent(message)}`);
}

function errorMessage(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The credit-order action could not be completed.";
}

function cleanNumber(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

export async function creditOrderLifecycleAction(formData: FormData) {
  const token = await requireCustomerToken();
  const number = cleanNumber(formData.get("number"));
  const action = String(formData.get("action") || "").trim();
  const comment = String(formData.get("comment") || "").trim();

  if (!number) redirect("/account/credit-orders?error=Missing%20credit-order%20number.");
  if (!(["approve", "reject", "cancel", "place"] as string[]).includes(action)) {
    detailRedirect(number, "error", "Unknown credit-order action.");
  }

  try {
    const current = (await getCreditOrder(token, number)).css_credit_order;
    const allowed = action === "approve"
      ? current.actions.can_approve
      : action === "reject"
        ? current.actions.can_reject
        : action === "cancel"
          ? current.actions.can_cancel
          : current.actions.can_place_order && !current.actions.requires_payment_details;

    if (!allowed) throw new Error("Fluid no longer allows that action for this credit order.");
    if (comment && !current.actions.can_add_comment) {
      throw new Error("Fluid allows the lifecycle action, but not an attached comment for this user.");
    }

    await performCreditOrderAction(
      token,
      action as "approve" | "reject" | "cancel" | "place",
      number,
      comment || undefined,
    );
  } catch (error) {
    detailRedirect(number, "error", errorMessage(error));
  }

  const label = action === "approve"
    ? "Approval recorded."
    : action === "reject"
      ? "Credit order rejected."
      : action === "cancel"
        ? "Credit order cancelled."
        : "Magento sales-order creation completed.";
  detailRedirect(number, "notice", label);
}

export async function addCreditOrderCommentAction(formData: FormData) {
  const token = await requireCustomerToken();
  const number = cleanNumber(formData.get("number"));
  const comment = String(formData.get("comment") || "").trim();

  if (!number) redirect("/account/credit-orders?error=Missing%20credit-order%20number.");
  if (!comment) detailRedirect(number, "error", "Enter a comment before submitting.");

  try {
    const current = (await getCreditOrder(token, number)).css_credit_order;
    if (!current.actions.can_add_comment) {
      throw new Error("Fluid no longer allows comments on this credit order.");
    }
    await addCreditOrderComment(token, number, comment);
  } catch (error) {
    detailRedirect(number, "error", errorMessage(error));
  }

  detailRedirect(number, "notice", "Comment added.");
}

export async function setCreditOrderPurchaseOrderNumberAction(formData: FormData) {
  const token = await requireCustomerToken();
  const number = cleanNumber(formData.get("number"));
  const purchaseOrderNumber = String(formData.get("purchase_order_number") || "").trim();

  if (!number) redirect("/account/credit-orders?error=Missing%20credit-order%20number.");
  if (!purchaseOrderNumber) detailRedirect(number, "error", "Enter a PO number before submitting.");

  try {
    const current = (await getCreditOrder(token, number)).css_credit_order;
    const status = current.status.toLowerCase();
    const looksLikeMissingPo = status === "approved"
      && !current.actions.can_place_order
      && !current.actions.requires_payment_details;

    if (!looksLikeMissingPo) {
      throw new Error("This credit order is not currently waiting for PO completion.");
    }

    await setCreditOrderPurchaseOrderNumber(token, number, purchaseOrderNumber);
  } catch (error) {
    detailRedirect(number, "error", errorMessage(error));
  }

  detailRedirect(number, "notice", "PO number submitted. Fluid has re-evaluated order readiness.");
}
