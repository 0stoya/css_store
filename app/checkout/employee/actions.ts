"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { assignCartEmployee, getCustomerCartWriteContext } from "@/lib/magento/cart";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { requireCustomerToken } from "@/lib/session";

function errorMessage(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The checkout Employee could not be selected.";
}

export async function selectCheckoutEmployeeAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;

  try {
    const employeeId = Number(formData.get("employee_id"));
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new Error("Choose an active Employee.");
    }

    const [cart, ordering] = await Promise.all([
      getCustomerCartWriteContext(token),
      getEmployeeOrdering(token),
    ]);

    if (!ordering.usesEmployee) {
      throw new Error("Employee ordering is not enabled for this company.");
    }
    if (ordering.multiEmployeeBasket) {
      throw new Error("This company assigns Employees per basket line before checkout.");
    }
    if (!ordering.employees.some((employee) => employee.employee_id === employeeId)) {
      throw new Error("Choose an active Employee from this company.");
    }
    if (!cart.itemsV2.items.length) {
      throw new Error("The basket is empty.");
    }

    await assignCartEmployee(token, cart.id, employeeId);
  } catch (error) {
    failure = errorMessage(error);
  }

  redirect(failure
    ? `/checkout/employee?error=${encodeURIComponent(failure)}`
    : "/checkout/delivery");
}
