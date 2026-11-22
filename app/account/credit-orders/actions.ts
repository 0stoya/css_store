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
    // After a PO is saved, the clerk can lose detail-view permission even if
    // subsequent Magento order conversion fails. Never send a clerk back to
    // an inaccessible order detail, regardless of success or uncertainty.
    redirect(`/account/credit-orders?scope=PO&${query.toString()}`);
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
  let submittedOrder: Awaited<ReturnType<typeof setCreditOrderPurchaseOrderNumber>> | null = null;
  try {
    const current = (await getCreditOrder(token, number)).css_credit_order;
    if (!current.actions.can_enter_po_number) {
      throw new Error("You cannot enter a PO number for this credit order. Check its approval status and your PO role.");
    }

    poMutationAttempted = true;
    submittedOrder = await setCreditOrderPurchaseOrderNumber(token, number, purchaseOrderNumber);
  } catch (error) {
    // Saving the PO and creating the sales order are distinct backend steps.
    // A placement exception can arrive AFTER the PO and its activity log are
    // saved, and an authorised queue consumer may place the order later.
    // Never present such a mixed outcome as a definitive failed PO submission.
    unstable_rethrow(error);
    if (!poMutationAttempted) {
      detailRedirect(number, "error", errorMessage(error), from);
    }
    revalidatePath("/account", "layout");

    let readback: Awaited<ReturnType<typeof getCreditOrder>>["css_credit_order"] | null = null;
    try {
      readback = (await getCreditOrder(token, number)).css_credit_order;
    } catch (readError) {
      unstable_rethrow(readError);
      // Detail access can disappear after a PO-only clerk's accepted entry.
      // An unreadable result must never be claimed successful.
    }

    if (readback?.status === "order_placed" && (readback.order_id ?? 0) > 0) {
      const salesOrder = readback.order_number ? ` Sales order ${readback.order_number} created.` : " Sales order created.";
      detailRedirect(number, "notice", `PO number saved.${salesOrder}`, "po");
    }
    if (readback?.logs.some((entry) => entry.activity_type === "set_purchase_order_number")) {
      detailRedirect(number, "notice", "PO number saved. Sales order not yet confirmed.", "po");
    }

    detailRedirect(
      number,
      "error",
      "PO outcome unconfirmed. An administrator must check whether the PO was saved and whether a sales order exists before anyone retries.",
      from,
    );
  }
  if (poMutationAttempted) revalidatePath("/account", "layout");

  // Confirm the sales order only when Magento returns a linked, placed order.
  // The PO clerk may lose detail-view permission when the order leaves the queue.
  const salesOrderPlaced = submittedOrder?.status === "order_placed"
    && (submittedOrder.order_id ?? 0) > 0;
  const notice = salesOrderPlaced
    ? `PO number saved. Sales order${submittedOrder?.order_number ? ` ${submittedOrder.order_number}` : ""} created.`
    : "PO number saved. Sales order not yet confirmed.";
  detailRedirect(number, "notice", notice, "po");
}
