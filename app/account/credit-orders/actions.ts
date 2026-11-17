"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  addCreditOrderComment,
  getCreditOrder,
  performCreditOrderAction,
  setCreditOrderPurchaseOrderNumber,
} from "@/lib/magento/credit-orders";
import { requireCustomerToken } from "@/lib/session";

type DetailSource = "approvals" | "po" | undefined;

function detailRedirect(
  number: string,
  kind: "error" | "notice",
  message: string,
  from?: DetailSource,
): never {
  const query = new URLSearchParams({ [kind]: message });
  if (from === "approvals") query.set("from", "approvals");
  if (from === "po") {
    if (kind === "notice") {
      redirect(`/account/credit-orders?scope=PO&${query.toString()}`);
    }
    query.set("from", "po");
  }
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
  const source = String(formData.get("from") || "");
  return source === "approvals" || source === "po" ? source : undefined;
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

  let approvalFollowup: string | null = null;
  let lifecycleMutationAttempted = false;
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

    lifecycleMutationAttempted = true;
    const result = await performCreditOrderAction(
      token,
      action as "approve" | "reject" | "cancel" | "place",
      number,
      comment || undefined,
    );
    // A successful approval is not necessarily final in Fluid's multi-stage
    // hierarchy. PO completion is deliberately a separate authorised step.
    if (action === "approve") {
      if (result.status === "approval_required" || result.status === "pending") {
        approvalFollowup = "Approval recorded. This order is waiting for another approval.";
      } else if (result.status === "approved" && !result.actions.can_place_order
        && !result.actions.requires_payment_details) {
        approvalFollowup = "Approval recorded. An authorised user can add a PO number below if required.";
      }
    }
  } catch (error) {
    // Magento can persist a PO/order transition before a later step fails.
    // Refresh the badge counts even after an attempted-but-failed mutation.
    if (lifecycleMutationAttempted) revalidatePath("/account", "layout");
    detailRedirect(number, "error", errorMessage(error), from);
  }
  if (lifecycleMutationAttempted) revalidatePath("/account", "layout");

  const label = action === "approve"
    ? approvalFollowup || "Approval recorded."
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
  if (!/^[A-Za-z0-9-]{1,16}$/.test(purchaseOrderNumber)) {
    detailRedirect(number, "error", "PO number must contain 1–16 letters, numbers or dashes.", from);
  }

  let poMutationAttempted = false;
  try {
    const current = (await getCreditOrder(token, number)).css_credit_order;
    if (!current.actions.can_enter_po_number) {
      throw new Error("You cannot enter a PO number for this credit order. Check its approval status and your PO role.");
    }

    poMutationAttempted = true;
    await setCreditOrderPurchaseOrderNumber(token, number, purchaseOrderNumber);
  } catch (error) {
    if (poMutationAttempted) revalidatePath("/account", "layout");
    detailRedirect(number, "error", errorMessage(error), from);
  }
  if (poMutationAttempted) revalidatePath("/account", "layout");

  // The PO clerk may lose detail-view permission when the number is saved
  // and the order leaves the awaiting-PO state. Always return to their queue.
  detailRedirect(number, "notice", "PO number recorded. If all placement checks passed, the Magento sales order has been created.", "po");
}
