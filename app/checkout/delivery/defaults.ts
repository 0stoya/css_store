"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { defaultSavedAddress, soleUnselectedShippingMethod } from "@/lib/checkout-defaults";
import { getDeliveryContext, setSavedShippingAddress, setShippingMethod, type DeliveryContext } from "@/lib/magento/shipping";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { requireCustomerToken } from "@/lib/session";
import { assertNormalCheckoutSession } from "@/lib/punchout/guard";
import { assertEmployeeDeliveryReviewComplete } from "@/lib/employee-delivery-review";
import { assertControlledCartReady, controlledDeliveryApplies, selectedCartEmployeeId } from "@/lib/controlled-employee-delivery";
import { assertEmployeeCatalogueCartReady } from "@/lib/employee-catalogue";

function singleEmployee(context: DeliveryContext) {
  const config = context.css_company_employee_configuration;
  return config.uses_employee && !config.multi_employee_basket;
}

function sameAddress(saved: ReturnType<typeof defaultSavedAddress>, current: DeliveryContext["customerCart"]["shipping_addresses"][number] | undefined) {
  if (!saved || !current) return false;
  const norm = (value: string | null | undefined) => (value || "").trim().toLowerCase();
  return norm(saved.firstname) === norm(current.firstname)
    && norm(saved.lastname) === norm(current.lastname)
    && JSON.stringify(saved.street.map(norm).filter(Boolean)) === JSON.stringify(current.street.map(norm).filter(Boolean))
    && norm(saved.city) === norm(current.city)
    && norm(saved.postcode) === norm(current.postcode)
    && norm(saved.country_code) === norm(current.country?.code);
}

// A hydrated checkout form POSTs once, never a GET/prefetch/render mutation.
// Form IDs are stale-page checks only. All choices come from current Magento data.
export async function applyCheckoutDefaultsAction(formData: FormData) {
  let failure: string | null = null;
  try {
    await assertNormalCheckoutSession();
    const token = await requireCustomerToken();
    const expectedCartId = String(formData.get("cart_id") || "");
    const expectedCompanyId = Number(formData.get("company_id"));
    const expectedCustomerId = Number(formData.get("customer_id"));
    const read = async () => {
      const context = await getDeliveryContext(token);
      const cart = context.customerCart;
      const caps = context.css_ordering_capabilities;
      if (!expectedCartId || !Number.isSafeInteger(expectedCompanyId) || expectedCompanyId <= 0
        || !Number.isSafeInteger(expectedCustomerId) || expectedCustomerId <= 0
        || cart.id !== expectedCartId || cart.total_quantity <= 0
        || context.css_company_context.selected_company_id !== expectedCompanyId
        || context.css_company_context.customer_id !== expectedCustomerId
        || !caps.authenticated || !caps.company_context || !caps.company_active || !caps.can_checkout) {
        throw new Error("Your checkout context changed. Review delivery and try again.");
      }
      await assertEmployeeDeliveryReviewComplete(cart.id);
      if (singleEmployee(context)) {
        const employeeId = selectedCartEmployeeId(context);
        const ordering = await getEmployeeOrdering(token);
        if (!employeeId || !ordering.usesEmployee || ordering.multiEmployeeBasket
          || !ordering.employees.some((employee) => employee.employee_id === employeeId)) {
          throw new Error("Confirm the selected Employee before continuing.");
        }
      }
      return context;
    };

    let context = await read();
    const cartId = context.customerCart.id;
    await assertEmployeeCatalogueCartReady(token, cartId);
    // Employee addresses have their own existing assignment/recipient flow.
    // Never substitute a buyer's personal default for an Employee destination.
    if (!singleEmployee(context) && context.customerCart.shipping_addresses.length === 0) {
      const address = defaultSavedAddress(context.customer.addresses);
      if (address) {
        await setSavedShippingAddress(token, cartId, address.id);
        context = await read();
        if (!sameAddress(address, context.customerCart.shipping_addresses[0])) {
          throw new Error("Magento did not retain the default delivery address. Please select an address.");
        }
      }
    }

    const method = soleUnselectedShippingMethod(context.customerCart.shipping_addresses[0] || null);
    if (method) {
      if (await controlledDeliveryApplies(context)) {
        await assertControlledCartReady(token, cartId);
      }
      const updated = await setShippingMethod(token, cartId, method.carrier_code, method.method_code);
      const selected = updated.shipping_addresses[0]?.selected_shipping_method;
      if (updated.id !== cartId || selected?.carrier_code !== method.carrier_code || selected.method_code !== method.method_code) {
        throw new Error("Magento did not retain the delivery method. Please select a method.");
      }
    }
  } catch (error) {
    unstable_rethrow(error);
    // Leave ordinary checkout controls available; don't repeat a failing automatic POST.
    failure = error instanceof Error ? error.message : "Automatic delivery selection is unavailable.";
  }
  redirect(failure ? `/checkout/delivery?error=${encodeURIComponent(failure)}` : "/checkout/delivery?defaults=done");
}
