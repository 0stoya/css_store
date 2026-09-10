"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { getCustomerCartWriteContext } from "@/lib/magento/cart";
import { repeatGroupedConfigurableOrder } from "@/lib/magento/repeat-orders";
import { requireCustomerToken } from "@/lib/session";

function message(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The order could not be repeated.";
}

function ordersRedirect(page: string, kind: "error" | "notice" | "warning", value: string): never {
  const pageQuery = Number.isInteger(Number(page)) && Number(page) > 1 ? `page=${encodeURIComponent(page)}&` : "";
  redirect(`/account/orders?${pageQuery}${kind}=${encodeURIComponent(value)}`);
}

export async function repeatOrderAction(formData: FormData) {
  const token = await requireCustomerToken();
  const orderNumber = String(formData.get("order_number") || "").trim();
  const page = String(formData.get("page") || "1").trim();
  if (!orderNumber) ordersRedirect(page, "error", "Missing order number.");

  try {
    const cart = await getCustomerCartWriteContext(token);
    const result = await repeatGroupedConfigurableOrder(token, cart.id, orderNumber);
    const skipped = result.skipped_items.map((item) => `${item.sku}: ${item.reason}`);
    const decisions = result.purchase_decisions
      .filter((item) => item.decision.status !== "ALLOWED")
      .map((item) => `${item.parent_sku}: ${item.decision.reason || item.decision.status}`);
    const warnings = [...skipped, ...decisions];

    if (warnings.length) {
      ordersRedirect(
        page,
        "warning",
        `${result.repeated_items.length} item${result.repeated_items.length === 1 ? "" : "s"} repeated from ${result.source_order_number}. Intervention required: ${warnings.join(" · ")}`,
      );
    }

    ordersRedirect(
      page,
      "notice",
      `${result.repeated_items.length} item${result.repeated_items.length === 1 ? "" : "s"} repeated from ${result.source_order_number} into your basket.`,
    );
  } catch (error) {
    ordersRedirect(page, "error", message(error));
  }
}
