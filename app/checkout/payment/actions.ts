"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import {
  getCheckoutContext,
  placeCheckoutOrder,
  setBillingSameAsShipping,
  setCheckoutPaymentMethod,
  submitCreditOrder,
  type CheckoutContext,
} from "@/lib/magento/checkout";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { assertNormalCheckoutSession } from "@/lib/punchout/browser-session";
import { requireCustomerToken } from "@/lib/session";

function paymentRedirect(kind: "error" | "notice", value: string): never {
  redirect(`/checkout/payment?${kind}=${encodeURIComponent(value)}`);
}

function deliveryRedirect(value: string): never {
  redirect(`/checkout/delivery?error=${encodeURIComponent(value)}`);
}

function message(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The order could not be submitted.";
}

function assignedEmployeeId(item: CheckoutContext["customerCart"]["itemsV2"]["items"][number]) {
  return item.css_employee?.employee_id ?? item.css_kit?.employee_id ?? null;
}

function assertEmployeeReady(
  cart: CheckoutContext["customerCart"],
  ordering: Awaited<ReturnType<typeof getEmployeeOrdering>>,
) {
  if (!ordering.usesEmployee || ordering.multiEmployeeBasket) return;

  const activeEmployeeIds = new Set(ordering.employees.map((employee) => employee.employee_id));
  const assignedIds = cart.itemsV2.items.map(assignedEmployeeId).filter((id): id is number => id !== null);
  const ready = assignedIds.length === cart.itemsV2.items.length
    && assignedIds.length > 0
    && assignedIds.every((id) => id === assignedIds[0])
    && activeEmployeeIds.has(assignedIds[0]);

  if (!ready) throw new Error("Choose an Employee for this order before continuing.");
}

function assertCheckoutReady(context: CheckoutContext, ordering: Awaited<ReturnType<typeof getEmployeeOrdering>>) {
  const cart = context.customerCart;
  const capabilities = context.css_ordering_capabilities;

  if (!cart?.id || cart.total_quantity <= 0) throw new Error("Your basket is empty.");
  if (!capabilities.authenticated || !capabilities.company_context || !capabilities.company_active || !capabilities.can_checkout) {
    throw new Error("This company is not currently allowed to place this order.");
  }

  assertEmployeeReady(cart, ordering);

  const shippingAddress = cart.shipping_addresses[0];
  if (!shippingAddress) throw new Error("Choose a delivery address before continuing.");
  if (!shippingAddress.selected_shipping_method) throw new Error("Choose a delivery method before continuing.");

  return cart;
}

function confirmationUrl(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  return `/checkout/confirmation?${search.toString()}`;
}

export async function preparePaymentAction() {
  const token = await requireCustomerToken();

  try {
    await assertNormalCheckoutSession();
    const [context, ordering] = await Promise.all([
      getCheckoutContext(token),
      getEmployeeOrdering(token),
    ]);
    const cart = assertCheckoutReady(context, ordering);
    await setBillingSameAsShipping(token, cart.id);
  } catch (error) {
    deliveryRedirect(message(error));
  }

  redirect("/checkout/payment");
}

export async function completeCheckoutAction(formData: FormData) {
  const token = await requireCustomerToken();
  const paymentCode = String(formData.get("payment_method") || "").trim();
  if (!paymentCode) paymentRedirect("error", "Choose a payment method.");

  try {
    await assertNormalCheckoutSession();
    const [initial, ordering] = await Promise.all([
      getCheckoutContext(token),
      getEmployeeOrdering(token),
    ]);
    const initialCart = assertCheckoutReady(initial, ordering);
    const paymentMethod = initialCart.available_payment_methods.find((method) => method.code === paymentCode);
    if (!paymentMethod) throw new Error("That payment method is no longer available for this basket.");

    // Keep billing aligned with the selected delivery address immediately before payment.
    // This is cart-only and does not mutate the customer's saved Magento address book.
    await setBillingSameAsShipping(token, initialCart.id);
    await setCheckoutPaymentMethod(token, initialCart.id, paymentMethod.code);

    // Re-read immediately before the irreversible submission so cart/company/payment state
    // cannot be decided from stale browser input.
    const current = await getCheckoutContext(token);
    const cart = assertCheckoutReady(current, ordering);
    if (cart.id !== initialCart.id) throw new Error("Your basket changed during checkout. Review it and try again.");
    if (!cart.available_payment_methods.some((method) => method.code === paymentMethod.code)) {
      throw new Error("That payment method is no longer available for this basket.");
    }
    if (cart.selected_payment_method?.code !== paymentMethod.code) {
      throw new Error("Magento did not retain the selected payment method.");
    }

    if (current.css_ordering_capabilities.can_submit_credit_order) {
      const result = await submitCreditOrder(token, cart.id);
      redirect(confirmationUrl({
        kind: "credit",
        credit: result.credit_order_number || result.credit_order_id,
        status: result.status,
        approval: result.approval_required,
        auto: result.auto_approved,
        placed: result.order_placed,
        order: result.order_number,
      }));
    }

    // Native Magento order placement is only valid when Fluid explicitly says this company
    // quote is ALLOWED. Missing/approval-required state fails closed instead of bypassing
    // the company credit-order workflow.
    if (cart.css_purchase_eligibility?.approval_status !== "ALLOWED") {
      throw new Error("Fluid has not authorised this company basket for native order placement.");
    }

    const order = await placeCheckoutOrder(token, cart.id);
    redirect(confirmationUrl({ kind: "order", order: order.order_number }));
  } catch (error) {
    paymentRedirect("error", message(error));
  }
}
