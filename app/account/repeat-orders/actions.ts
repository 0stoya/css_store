"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { getCustomerCartWriteContext } from "@/lib/magento/cart";
import {
  addRepeatOrderListToCart,
  createRepeatOrderList,
  deleteRepeatOrderList,
  deleteRepeatOrderListItem,
  updateRepeatOrderList,
} from "@/lib/magento/repeat-orders";
import { requireCustomerToken } from "@/lib/session";

function errorMessage(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The repeat-order action could not be completed.";
}

function positiveId(value: FormDataEntryValue | null, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Missing or invalid ${label}.`);
  return id;
}

function redirectWith(kind: "error" | "notice" | "warning", message: string): never {
  redirect(`/account/repeat-orders?${kind}=${encodeURIComponent(message)}`);
}

function warningSummary(result: {
  skipped_items: Array<{ sku: string; reason: string | null }>;
  purchase_decisions: Array<{ parent_sku: string; decision: { status: string; reason: string | null } }>;
}) {
  const skipped = result.skipped_items.map((item) => `${item.sku}: ${item.reason || "not compatible"}`);
  const decisions = result.purchase_decisions
    .filter((item) => item.decision.status !== "ALLOWED")
    .map((item) => `${item.parent_sku}: ${item.decision.reason || item.decision.status}`);
  return [...skipped, ...decisions].join(" · ");
}

export async function createRepeatOrderListAction(formData: FormData) {
  const token = await requireCustomerToken();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!name) redirectWith("error", "Enter a repeat-list name.");

  try {
    await createRepeatOrderList(token, { name, ...(description ? { description } : {}) });
  } catch (error) {
    redirectWith("error", errorMessage(error));
  }
  redirectWith("notice", `Created repeat list “${name}”.`);
}

export async function updateRepeatOrderListAction(formData: FormData) {
  const token = await requireCustomerToken();
  let listId: number;
  try {
    listId = positiveId(formData.get("list_id"), "repeat-list ID");
  } catch (error) {
    redirectWith("error", errorMessage(error));
  }
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!name) redirectWith("error", "Repeat-list name cannot be empty.");

  try {
    await updateRepeatOrderList(token, { list_id: listId!, name, description });
  } catch (error) {
    redirectWith("error", errorMessage(error));
  }
  redirectWith("notice", `Updated repeat list “${name}”.`);
}

export async function deleteRepeatOrderListAction(formData: FormData) {
  const token = await requireCustomerToken();
  try {
    const listId = positiveId(formData.get("list_id"), "repeat-list ID");
    await deleteRepeatOrderList(token, listId);
  } catch (error) {
    redirectWith("error", errorMessage(error));
  }
  redirectWith("notice", "Repeat list deleted.");
}

export async function deleteRepeatOrderListItemAction(formData: FormData) {
  const token = await requireCustomerToken();
  try {
    const listId = positiveId(formData.get("list_id"), "repeat-list ID");
    const itemId = positiveId(formData.get("delete_item_id"), "repeat-list item ID");
    await deleteRepeatOrderListItem(token, listId, itemId);
  } catch (error) {
    redirectWith("error", errorMessage(error));
  }
  redirectWith("notice", "Repeat-list item deleted.");
}

export async function addRepeatOrderListToCartAction(formData: FormData) {
  const token = await requireCustomerToken();
  let listId: number;
  try {
    listId = positiveId(formData.get("list_id"), "repeat-list ID");
  } catch (error) {
    redirectWith("error", errorMessage(error));
  }

  const mode = String(formData.get("mode") || "all");
  const itemIds = mode === "selected"
    ? formData.getAll("item_id").map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : undefined;
  if (mode === "selected" && !itemIds?.length) {
    redirectWith("error", "Choose at least one compatible repeat-list item.");
  }

  try {
    const cart = await getCustomerCartWriteContext(token);
    const result = await addRepeatOrderListToCart(token, { cartId: cart.id, listId: listId!, itemIds });
    const warning = warningSummary(result);
    if (warning) {
      redirectWith("warning", `${result.added_items.length} item${result.added_items.length === 1 ? "" : "s"} added. Intervention required: ${warning}`);
    }
    redirectWith(
      "notice",
      `${result.added_items.length} repeat-list item${result.added_items.length === 1 ? "" : "s"} added to the basket.`,
    );
  } catch (error) {
    redirectWith("error", errorMessage(error));
  }
}
