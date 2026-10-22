"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { MagentoGraphQLError } from "@/lib/magento/client";
import {
  getCheckoutContext,
  placeCheckoutOrder,
  setBillingSameAsShipping,
  setBillingSavedAddress,
  setCheckoutPaymentMethod,
  submitCreditOrder,
  type CheckoutContext,
} from "@/lib/magento/checkout";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { requireCustomerToken } from "@/lib/session";
import { assertEmployeeDeliveryReviewComplete } from "@/lib/employee-delivery-review";
import { assertControlledCartReady } from "@/lib/controlled-employee-delivery";

function paymentRedirect(kind: "error" | "notice", value: string, poRequired = false): never {
  const params = new URLSearchParams({ [kind]: value });
  if (poRequired) params.set("po", "required");
  redirect(`/checkout/payment?${params.toString()}`);
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
    const [context, ordering] = await Promise.all([
      getCheckoutContext(token),
      getEmployeeOrdering(token),
    ]);
    const cart = assertCheckoutReady(context, ordering);
    await assertEmployeeDeliveryReviewComplete(cart.id);
    const policy = await assertControlledCartReady(token, cart.id);
    if (policy.controlled) {
      await setBillingSavedAddress(token, cart.id, policy.addressId);
    } else {
      await setBillingSameAsShipping(token, cart.id);
    }
  } catch (error) {
    deliveryRedirect(message(error));
  }

  redirect("/checkout/payment");
}

export async function completeCheckoutAction(formData: FormData) {
  // Explicitly block both native orders and credit-order submissions while
  // testing address preselection against a live Magento test customer's cart.
  // The flag is not enabled in production.
  if (typeof process !== "undefined" && process.env.CSS_EMPLOYEE_ADDRESS_STAGING_NO_SUBMIT === "1") {
    paymentRedirect("error", "Order placement is disabled on the Employee address staging instance.");
  }
  const token = await requireCustomerToken();
  const paymentCode = String(formData.get("payment_method") || "").trim();
  if (!paymentCode) paymentRedirect("error", "Choose a payment method.");

  // The Store has no trusted per-buyer PO-entry capability field. Only reveal
  // the PO prompt after the existing Fluid submission validator requires one.
  const poWasRequested = formData.get("po_requested") === "1";
  const purchaseOrderNumber = String(formData.get("purchase_order_number") || "").trim();
  let creditFlow = false;

  try {
    const [initial, ordering] = await Promise.all([
      getCheckoutContext(token),
      getEmployeeOrdering(token),
    ]);
    const initialCart = assertCheckoutReady(initial, ordering);
    creditFlow = initial.css_ordering_capabilities.can_submit_credit_order;
    if (purchaseOrderNumber && !creditFlow) {
      throw new Error("PO entry is not available for this payment flow.");
    }
    if (poWasRequested && !purchaseOrderNumber) {
      throw new Error("Enter a PO number before submitting.");
    }
    if (purchaseOrderNumber && !/^[A-Za-z0-9-]{1,16}$/.test(purchaseOrderNumber)) {
      throw new Error("PO number must contain 1–16 letters, numbers or dashes.");
    }
    await assertEmployeeDeliveryReviewComplete(initialCart.id);
    const initialPolicy = await assertControlledCartReady(token, initialCart.id);
    const paymentMethod = initialCart.available_payment_methods.find((method) => method.code === paymentCode);
    if (!paymentMethod) throw new Error("That payment method is no longer available for this basket.");

    // In controlled mode, the first shipping street line contains an
    // order-only recipient; billing instead uses the original manager-owned
    // saved Magento address, so invoices do not inherit "Attn:".
    if (initialPolicy.controlled) {
      await setBillingSavedAddress(token, initialCart.id, initialPolicy.addressId);
    } else {
      await setBillingSameAsShipping(token, initialCart.id);
    }
    await setCheckoutPaymentMethod(
      token, initialCart.id, paymentMethod.code,
      creditFlow ? purchaseOrderNumber || undefined : undefined,
    );

    // Re-read immediately before the irreversible submission so cart/company/payment state
    // cannot be decided from stale browser input.
    const current = await getCheckoutContext(token);
    const cart = assertCheckoutReady(current, ordering);
    await assertEmployeeDeliveryReviewComplete(cart.id);
    await assertControlledCartReady(token, cart.id);
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
    const poRequired = creditFlow && (
      poWasRequested
      || (error instanceof MagentoGraphQLError && /^PO Number is required\.?$/i.test(error.message.trim()))
    );
    paymentRedirect("error", message(error), poRequired);
  }
}
