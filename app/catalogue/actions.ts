"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { requireCustomerToken } from "@/lib/session";
import { assertNormalCheckoutSession } from "@/lib/punchout/guard";
import { getActiveEmployees } from "@/lib/magento/employee";
import { getEmployeeCataloguePolicy } from "@/lib/employee-catalogue-db";
import { getEmployeeCatalogueMode, setSelectedEmployee, clearSelectedEmployee } from "@/lib/employee-catalogue";

export async function selectEmployeeCatalogueAction(formData: FormData) {
  await assertNormalCheckoutSession();
  const token = await requireCustomerToken();
  let error: string | null = null;
  try {
    const mode = await getEmployeeCatalogueMode(token);
    if (!mode) throw new Error("Employee catalogue shopping is not enabled for this company.");
    const employeeId = Number(formData.get("employee_id"));
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      throw new Error("Choose an active Employee.");
    }
    const employees = await getActiveEmployees(token);
    const employee = employees.find((e) => e.employee_id === employeeId);
    if (!employee) throw new Error("That Employee is no longer available.");
    // Only store a signed selection after a fresh, qualified policy is proven.
    await getEmployeeCataloguePolicy(mode.companyId, employeeId);
    await setSelectedEmployee(mode, employeeId, employee.full_name);
  } catch (failure) {
    unstable_rethrow(failure);
    error = failure instanceof Error ? failure.message : "Employee selection is unavailable.";
  }
  redirect(error
    ? "/catalogue?error=" + encodeURIComponent(error) + "&choose=1"
    : "/catalogue");
}

export async function changeEmployeeCatalogueAction() {
  await assertNormalCheckoutSession();
  await requireCustomerToken();
  await clearSelectedEmployee();
  redirect("/catalogue?choose=1");
}
