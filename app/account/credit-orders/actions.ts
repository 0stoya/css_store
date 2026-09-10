"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import {
  addCreditOrderComment,
  getCreditOrder,
  performCreditOrderAction,
  setCreditOrderPurchaseOrderNumber,
} from "@/lib/magento/credit-orders";
import { requireCustomerToken } from "@/lib/session";

type DetailSource = "approvals" | undefined;

function detailRedirect(
  number: string,
  kind: "error" | "notice",
  message: string,
  from?: DetailSource,
): never {
  const query = new URLSearchParams({ [kind]: message });
  if (from === "approvals") query.set("from", "approvals");
  redirect(`/account/credit-orders/${encodeURIComponent(number)}?${query.toString()}`);
}

function errorMessage(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The credit-order action could not be completed.";
}

function cleanNumber(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function detailSource(formData: FormData): DetailSource {
  return String(formData.get("from") || "") === "approvals" ? "approvals" : undefined;
}

export async function creditOrderLifecycleAction(formData: FormData) {
  const token = await requireCustomerToken();
  const number = cleanNumber(formData.get("number"));
  const action = String(formData.get("action") || "").trim();
  const comment = String(formData.get("comment") || "").trim();
  const from = detailSource(formData);

  if (!number) redirect(from === "approvals" ? "/account/credit-orders?scope=APPROVAL&error=Missing%20credit-order%20number." : "/account/credit-orders?error=Missing%20credit-order%20number.");
  if (!(["approve", "reject", "cancel", "place"] as string[]).includes(action)) {
    detailRedirect(number, "error", "Unknown credit-order action.", from);
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

    if (!allowed) throw new Error("This action is no longer available for this credit order.");
    if (comment && !current.actions.can_add_comment) {
      throw new Error("Comments are not available for your account on this credit order.");
    }

    await performCreditOrderAction(
      token,
      action as "approve" | "reject" | "cancel" | "place",
      number,
      comment || undefined,
    );
  } catch (error) {
    detailRedirect(number, "error", errorMessage(error), from);
  }

  const label = action === "approve"
    ? "Approval recorded."
    : action === "reject"
      ? "Credit order rejected."
      : action === "cancel"
        ? "Credit order cancelled."
        : "Order created.";
  detailRedirect(number, "notice", label, from);
}

export async function addCreditOrderCommentAction(formData: FormData) {
  const token = await requireCustomerToken();
  const number = cleanNumber(formData.get("number"));
  const comment = String(formData.get("comment") || "").trim();
  const from = detailSource(formData);

  if (!number) redirect(from === "approvals" ? "/account/credit-orders?scope=APPROVAL&error=Missing%20credit-order%20number." : "/account/credit-orders?error=Missing%20credit-order%20number.");
  if (!comment) detailRedirect(number, "error", "Enter a comment before submitting.", from);

  try {
    const current = (await getCreditOrder(token, number)).css_credit_order;
    if (!current.actions.can_add_comment) {
      throw new Error("Comments are no longer available for this credit order.");
    }
    await addCreditOrderComment(token, number, comment);
  } catch (error) {
    detailRedirect(number, "error", errorMessage(error), from);
  }

  detailRedirect(number, "notice", "Comment added.", from);
}

export async function setCreditOrderPurchaseOrderNumberAction(formData: FormData) {
  const token = await requireCustomerToken();
  const number = cleanNumber(formData.get("number"));
  const purchaseOrderNumber = String(formData.get("purchase_order_number") || "").trim();
  const from = detailSource(formData);

  if (!number) redirect(from === "approvals" ? "/account/credit-orders?scope=APPROVAL&error=Missing%20credit-order%20number." : "/account/credit-orders?error=Missing%20credit-order%20number.");
  if (!purchaseOrderNumber) detailRedirect(number, "error", "Enter a PO number before submitting.", from);

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
    detailRedirect(number, "error", errorMessage(error), from);
  }

  detailRedirect(number, "notice", "PO number submitted. Order readiness has been refreshed.", from);
}
