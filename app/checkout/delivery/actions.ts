"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import {
  getDeliveryContext,
  setNewShippingAddress,
  setSavedShippingAddress,
  setShippingMethod,
} from "@/lib/magento/shipping";
import { requireCustomerToken } from "@/lib/session";

function text(formData: FormData, key: string, required = true) {
  const value = String(formData.get(key) || "").trim();
  if (required && !value) throw new Error(`${key.replaceAll("_", " ")} is required.`);
  return value;
}

function deliveryRedirect(kind: "error" | "notice", value: string): never {
  redirect(`/checkout/delivery?${kind}=${encodeURIComponent(value)}`);
}

function message(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "Delivery details could not be updated.";
}

function assertCheckoutContext(context: Awaited<ReturnType<typeof getDeliveryContext>>) {
  const cart = context.customerCart;
  const capabilities = context.css_ordering_capabilities;
  if (!cart?.id || cart.total_quantity <= 0) throw new Error("Your basket is empty.");
  if (!capabilities.authenticated || !capabilities.company_context || !capabilities.company_active || !capabilities.can_checkout) {
    throw new Error("This company is not currently allowed to proceed through checkout.");
  }
  return cart;
}

export async function selectSavedShippingAddressAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;

  try {
    const addressId = Number(formData.get("customer_address_id"));
    if (!Number.isInteger(addressId) || addressId <= 0) throw new Error("Choose a saved delivery address.");

    const context = await getDeliveryContext(token);
    const cart = assertCheckoutContext(context);
    if (!context.customer.addresses.some((address) => address.id === addressId)) {
      throw new Error("That saved delivery address is not available to this customer.");
    }

    await setSavedShippingAddress(token, cart.id, addressId);
  } catch (error) {
    failure = message(error);
  }

  deliveryRedirect(failure ? "error" : "notice", failure || "Delivery address selected.");
}

export async function setNewShippingAddressAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;

  try {
    const context = await getDeliveryContext(token);
    const cart = assertCheckoutContext(context);
    const street = [text(formData, "street_1"), text(formData, "street_2", false)].filter(Boolean);
    const region = text(formData, "region", false);
    const company = text(formData, "company", false);

    await setNewShippingAddress(token, cart.id, {
      firstname: text(formData, "firstname"),
      lastname: text(formData, "lastname"),
      ...(company ? { company } : {}),
      street,
      city: text(formData, "city"),
      ...(region ? { region } : {}),
      postcode: text(formData, "postcode"),
      country_code: text(formData, "country_code").toUpperCase(),
      telephone: text(formData, "telephone"),
      save_in_address_book: false,
    });
  } catch (error) {
    failure = message(error);
  }

  deliveryRedirect(failure ? "error" : "notice", failure || "Delivery address applied to this basket.");
}

export async function selectShippingMethodAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;

  try {
    const carrierCode = text(formData, "carrier_code");
    const methodCode = text(formData, "method_code");
    const context = await getDeliveryContext(token);
    const cart = assertCheckoutContext(context);
    const shippingAddress = cart.shipping_addresses[0];
    if (!shippingAddress) throw new Error("Choose a delivery address before selecting a delivery method.");

    const method = shippingAddress.available_shipping_methods.find(
      (candidate) => candidate.carrier_code === carrierCode && candidate.method_code === methodCode,
    );
    if (!method || method.available === false) {
      throw new Error("That delivery method is no longer available for this basket.");
    }

    await setShippingMethod(token, cart.id, carrierCode, methodCode);
  } catch (error) {
    failure = message(error);
  }

  deliveryRedirect(failure ? "error" : "notice", failure || "Delivery method selected.");
}
