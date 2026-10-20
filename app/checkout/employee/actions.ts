"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { assignCartEmployee, getCustomerCartWriteContext } from "@/lib/magento/cart";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { getDeliveryContext, setSavedShippingAddress } from "@/lib/magento/shipping";
import {
  chooseOwnedSavedAddress,
  employeeAddressMappingConfigured,
  getAssignedEmployeeDeliveryAddress,
} from "@/lib/employee-delivery-address";
import {
  clearEmployeeDeliveryReview,
  markEmployeeDeliveryReviewPending,
} from "@/lib/employee-delivery-review";
import { requireCustomerToken } from "@/lib/session";
import { controlledDeliveryApplies } from "@/lib/controlled-employee-delivery";

function errorMessage(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The checkout Employee could not be selected.";
}

export async function selectCheckoutEmployeeAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;
  let notice = "Employee selected. Please confirm the delivery address.";

  try {
    const employeeId = Number(formData.get("employee_id"));
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      throw new Error("Choose an active Employee.");
    }

    const [cart, ordering, delivery] = await Promise.all([
      getCustomerCartWriteContext(token),
      getEmployeeOrdering(token),
      getDeliveryContext(token),
    ]);
    if (!ordering.usesEmployee) throw new Error("Employee ordering is not enabled for this company.");
    if (ordering.multiEmployeeBasket) throw new Error("This company assigns Employees per basket line before checkout.");
    if (!ordering.employees.some((employee) => employee.employee_id === employeeId)) {
      throw new Error("Choose an active Employee from this company.");
    }
    if (!cart.itemsV2.items.length) throw new Error("The basket is empty.");
    if (cart.id !== delivery.customerCart.id) {
      throw new Error("Your basket changed during checkout. Review it and try again.");
    }

    // If the policy cannot be read, do not fall back to open address selection.
    const controlled = await controlledDeliveryApplies(delivery);
    await assignCartEmployee(token, cart.id, employeeId);
    // Changing beneficiary never silently approves the previous destination.
    await markEmployeeDeliveryReviewPending(cart.id);

    try {
      if (!employeeAddressMappingConfigured()) throw new Error("Address lookup not configured.");
      const companyId = Number(delivery.css_company_context.selected_company_id);
      const customerId = Number(delivery.css_company_context.customer_id);
      const mappedId = await getAssignedEmployeeDeliveryAddress(companyId, customerId, employeeId);
      const ownedId = chooseOwnedSavedAddress(
        mappedId,
        delivery.customer.addresses.map((address) => address.id),
      );
      if (ownedId !== null) {
        await setSavedShippingAddress(token, cart.id, ownedId);
        if (controlled) {
          // The location is assigned, but an actual recipient is mandatory.
          // Do not clear the pending-review guard until the order-only
          // recipient shipping address has been written and verified.
          notice = "Employee selected. Enter the delivery recipient's name to confirm the assigned address.";
        } else {
          await clearEmployeeDeliveryReview();
          notice = "Employee selected. Their saved delivery address has been preselected.";
        }
      } else if (controlled) {
        notice = "This Employee has no assigned delivery address. Ask your company administrator to assign one.";
      }
    } catch {
      // Fail closed for controlled companies; no manual destination fallback.
      notice = controlled
        ? "Employee selected. The assigned address is unavailable. Contact your company administrator."
        : "Employee selected. Automatic address selection is unavailable; please confirm a delivery address.";
    }
  } catch (error) {
    failure = errorMessage(error);
  }

  redirect(failure
    ? `/checkout/delivery?error=${encodeURIComponent(failure)}`
    : `/checkout/delivery?notice=${encodeURIComponent(notice)}`);
}
