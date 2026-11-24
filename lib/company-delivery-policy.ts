import { getCompanyDeliveryModes, type CompanyDeliveryMode } from "@/lib/employee-delivery-address";
import type { CustomerShippingAddress, DeliveryContext, ShippingCartAddress } from "@/lib/magento/shipping";
import type { CheckoutContext, CheckoutShippingAddress } from "@/lib/magento/checkout";
import {
  getDeliveryContext, setSavedShippingAddress, setNewShippingAddress, setShippingMethod,
} from "@/lib/magento/shipping";
import { defaultSavedAddress } from "@/lib/checkout-defaults";
import {
  assignedOwnedAddress, cartOnlyRecipientAddress, confirmedCartRecipient,
  controlledDeliveryApplies, selectedCartEmployeeId,
} from "@/lib/controlled-employee-delivery";

export type CompanyDeliveryPolicy = {
  mode: CompanyDeliveryMode;
  addressBookLocked: boolean;
  companyId: number;
  customerId: number;
};

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
}

function norm(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function lines(value: string[]) {
  return JSON.stringify(value.map(norm).filter(Boolean));
}

function eligible(address: CustomerShippingAddress) {
  return validId(address.id) && Boolean(norm(address.firstname) && norm(address.lastname)
    && norm(address.city) && norm(address.postcode) && norm(address.telephone)
    && /^[a-z]{2}$/.test(norm(address.country_code))
    && Array.isArray(address.street) && address.street.some((line) => norm(line)));
}

type QuoteAddress = ShippingCartAddress | CheckoutShippingAddress;

function sameRegion(saved: CustomerShippingAddress, quote: QuoteAddress) {
  const name = norm(saved.region?.region);
  const code = norm(saved.region?.region_code);
  const qName = norm(quote.region?.label);
  const qCode = norm(quote.region?.code);
  if (!name && !code) return !qName && !qCode;
  if (name && qName && name !== qName) return false;
  if (code && qCode && code !== qCode) return false;
  return Boolean((name && (name === qName || name === qCode)) || (code && (code === qName || code === qCode)));
}

/** Compare actual physical destination and recipient/contact fields, not a posted address ID. */
export function matchesCompanySavedAddress(saved: CustomerShippingAddress, quote: QuoteAddress | null | undefined) {
  if (!quote || !eligible(saved) || !Array.isArray(quote.street)) return false;
  return norm(saved.firstname) === norm(quote.firstname)
    && norm(saved.lastname) === norm(quote.lastname)
    && norm(saved.company) === norm(quote.company)
    && lines(saved.street) === lines(quote.street)
    && norm(saved.city) === norm(quote.city)
    && norm(saved.postcode) === norm(quote.postcode)
    && norm(saved.country_code) === norm(quote.country?.code)
    && norm(saved.telephone) === norm(quote.telephone)
    && sameRegion(saved, quote);
}

export async function readCompanyDeliveryPolicy(delivery: DeliveryContext): Promise<CompanyDeliveryPolicy> {
  const context = delivery.css_company_context;
  const caps = delivery.css_ordering_capabilities;
  const companyId = context.selected_company_id;
  const customerId = context.customer_id;
  const memberships = context.companies;
  if (!caps.authenticated || !caps.company_context || !caps.company_active || !caps.can_checkout
    || !validId(companyId) || !validId(customerId) || !Array.isArray(memberships)
    || memberships.filter((company) => company.selected === true).length !== 1
    || !memberships.some((company) => company.selected === true && company.company_id === companyId)) {
    throw new Error("Your company delivery settings could not be verified.");
  }
  try {
    const ids = memberships.map((company) => company.company_id);
    if (!ids.length || ids.some((id) => !validId(id)) || new Set(ids).size !== ids.length) {
      throw new Error("Invalid membership scope");
    }
    const modes = await getCompanyDeliveryModes(ids);
    return {
      companyId, customerId,
      mode: modes.get(companyId) ?? "UNRESTRICTED",
      addressBookLocked: ids.some((id) => (modes.get(id) ?? "UNRESTRICTED") !== "UNRESTRICTED"),
    };
  } catch {
    throw new Error("Company delivery settings are temporarily unavailable. Contact your administrator.");
  }
}

export function companyPermittedAddresses(delivery: DeliveryContext, policy: CompanyDeliveryPolicy): CustomerShippingAddress[] {
  const addresses = delivery.customer.addresses;
  if (policy.mode === "UNRESTRICTED") return addresses;
  if (!Array.isArray(addresses) || addresses.some((address) => !validId(address.id))
    || new Set(addresses.map((address) => address.id)).size !== addresses.length) return [];
  if (policy.mode === "DEFAULT_ONLY") {
    const defaults = addresses.filter((address) => address.default_shipping === true);
    return defaults.length === 1 && eligible(defaults[0]) ? defaults : [];
  }
  return addresses.filter(eligible);
}

export function assertCompanySavedAddress(delivery: DeliveryContext, policy: CompanyDeliveryPolicy, addressId: number) {
  if (!companyPermittedAddresses(delivery, policy).some((address) => address.id === addressId)) {
    throw new Error("That delivery address is not permitted by your company's delivery settings.");
  }
}

export function assertCompanyNewAddress(policy: CompanyDeliveryPolicy, saveInAddressBook: boolean) {
  if (policy.mode !== "UNRESTRICTED") {
    throw new Error("Your company only permits saved Magento delivery addresses.");
  }
  if (saveInAddressBook && policy.addressBookLocked) {
    throw new Error("Your company memberships do not allow changes to your saved addresses.");
  }
}

export function companyDefaultAddress(delivery: DeliveryContext, policy: CompanyDeliveryPolicy) {
  const allowed = companyPermittedAddresses(delivery, policy);
  if (policy.mode === "DEFAULT_ONLY") return allowed[0] ?? null;
  return defaultSavedAddress(allowed);
}

/** The only exception is the existing, verified Employee order-only Attn line. */
function controlledMatch(saved: CustomerShippingAddress, quote: ShippingCartAddress | null) {
  const recipient = confirmedCartRecipient(saved, quote);
  return recipient && quote && matchesCompanySavedAddress(saved, { ...quote, street: quote.street.slice(1) })
    ? recipient : null;
}

export function companyDestinationReady(delivery: DeliveryContext, policy: CompanyDeliveryPolicy, controlled: boolean, assigned: CustomerShippingAddress | null) {
  if (policy.mode === "UNRESTRICTED") return true;
  const cart = delivery.customerCart;
  if (cart.shipping_addresses.length !== 1) return false;
  const quote = cart.shipping_addresses[0];
  const allowed = companyPermittedAddresses(delivery, policy);
  if (controlled) {
    return Boolean(assigned && allowed.some((address) => address.id === assigned.id) && controlledMatch(assigned, quote));
  }
  return allowed.some((address) => matchesCompanySavedAddress(address, quote));
}

async function resolveLockedDestination(delivery: DeliveryContext, policy: CompanyDeliveryPolicy) {
  if (!policy.addressBookLocked && policy.mode === "UNRESTRICTED") return null;
  const cart = delivery.customerCart;
  if (cart.shipping_addresses.length !== 1) throw new Error("Review the delivery address before continuing.");
  const quote = cart.shipping_addresses[0];
  const allowed = companyPermittedAddresses(delivery, policy);
  if (await controlledDeliveryApplies(delivery)) {
    const employeeId = selectedCartEmployeeId(delivery);
    const saved = employeeId ? await assignedOwnedAddress(delivery, employeeId) : null;
    const recipient = saved && allowed.some((address) => address.id === saved.id) ? controlledMatch(saved, quote) : null;
    if (!saved || !recipient) throw new Error("The assigned Employee delivery conflicts with your company delivery settings or needs confirmation.");
    return { saved, recipient };
  }
  const saved = allowed.find((address) => matchesCompanySavedAddress(address, quote));
  if (saved) return { saved, recipient: null };
  if (policy.mode !== "UNRESTRICTED") throw new Error("Choose a delivery address permitted by your company.");
  // A one-off address in an unrestricted company is allowed, but never saved
  // to the buyer's shared Magento address book if ANY membership is restricted.
  return null;
}

export async function assertCompanyCartDestination(delivery: DeliveryContext, policy: CompanyDeliveryPolicy) {
  // Unrestricted shipping is unchanged; stale save flags are cleared before submit.
  if (policy.mode !== "UNRESTRICTED") await resolveLockedDestination(delivery, policy);
}

function sameQuoteAddress(a: QuoteAddress | undefined, b: QuoteAddress | undefined) {
  return Boolean(a && b && Array.isArray(a.street) && Array.isArray(b.street)
    && norm(a.firstname) === norm(b.firstname) && norm(a.lastname) === norm(b.lastname)
    && norm(a.company) === norm(b.company) && lines(a.street) === lines(b.street)
    && norm(a.city) === norm(b.city) && norm(a.postcode) === norm(b.postcode)
    && norm(a.country?.code) === norm(b.country?.code) && norm(a.telephone) === norm(b.telephone)
    && norm(a.region?.code) === norm(b.region?.code) && norm(a.region?.label) === norm(b.region?.label));
}

function sameMoney(a: { value: number; currency: string } | null | undefined, b: { value: number; currency: string } | null | undefined) {
  return Boolean(a && b && Number.isFinite(a.value) && a.value === b.value && a.currency && a.currency === b.currency);
}

function sameRate(a: QuoteAddress["selected_shipping_method"], b: QuoteAddress["selected_shipping_method"]) {
  return Boolean(a && b && a.carrier_code === b.carrier_code && a.method_code === b.method_code && sameMoney(a.amount, b.amount));
}

function assertQuoteUnchanged(expected: CheckoutContext, actual: DeliveryContext) {
  const a = expected.customerCart;
  const b = actual.customerCart;
  if (a.shipping_addresses.length !== 1 || b.shipping_addresses.length !== 1
    || !sameQuoteAddress(a.shipping_addresses[0], b.shipping_addresses[0])
    || !sameRate(a.shipping_addresses[0].selected_shipping_method, b.shipping_addresses[0].selected_shipping_method)
    || a.total_quantity !== b.total_quantity
    || !sameMoney(a.prices?.subtotal_excluding_tax, b.prices?.subtotal_excluding_tax)
    || !sameMoney(a.prices?.grand_total, b.prices?.grand_total)) {
    throw new Error("Delivery or basket totals changed. Return to delivery and review your order.");
  }
}

/**
 * Fresh company/address verification at review and immediately before both
 * native and credit submission. Only the submit preparation phase writes.
 * Native GraphQL doesn't expose the quote's old save_in_address_book flag:
 * reapply the verified saved address ID or a cart-only copy with false, then
 * restore the exact available rate and compare quote/totals. This prevents an
 * old quote in another company from adding a new shared saved address.
 */
export async function checkCompanyDeliveryAtPayment(
  token: string,
  expected: CheckoutContext,
  phase: "review" | "normalise" | "final",
  normalisedBook = false,
): Promise<boolean> {
  const cartId = expected.customerCart.id;
  const read = async () => {
    const delivery = await getDeliveryContext(token);
    const policy = await readCompanyDeliveryPolicy(delivery);
    if (delivery.customerCart.id !== cartId || delivery.customerCart.total_quantity <= 0
      || policy.companyId !== expected.css_company_context.selected_company_id
      || policy.customerId !== expected.css_company_context.customer_id) {
      throw new Error("Your basket or company changed. Return to delivery.");
    }
    return { delivery, policy };
  };

  let { delivery, policy } = await read();
  if (!policy.addressBookLocked) return false;
  const match = await resolveLockedDestination(delivery, policy);
  assertQuoteUnchanged(expected, delivery);
  if (phase === "final" && !normalisedBook) {
    throw new Error("Your company delivery policy changed. Return to delivery and review your order.");
  }
  if (phase !== "normalise") return true;

  const quote = delivery.customerCart.shipping_addresses[0];
  const rate = quote.selected_shipping_method;
  if (!rate || !quote.country?.code) throw new Error("Complete delivery before submitting.");
  if (match?.recipient) {
    await setNewShippingAddress(token, cartId, cartOnlyRecipientAddress(match.saved, match.recipient));
  } else if (match) {
    await setSavedShippingAddress(token, cartId, match.saved.id);
  } else {
    await setNewShippingAddress(token, cartId, {
      firstname: quote.firstname, lastname: quote.lastname,
      ...(quote.company ? { company: quote.company } : {}),
      street: quote.street, city: quote.city, postcode: quote.postcode,
      country_code: quote.country.code, telephone: quote.telephone,
      ...(quote.region?.label || quote.region?.code ? { region: quote.region.label || quote.region.code || undefined } : {}),
      save_in_address_book: false,
    });
  }

  ({ delivery, policy } = await read());
  if (delivery.customerCart.shipping_addresses.length !== 1
    || !sameQuoteAddress(quote, delivery.customerCart.shipping_addresses[0])) {
    throw new Error("Magento changed the delivery address. Return to delivery and review your order.");
  }
  await resolveLockedDestination(delivery, policy);
  const fresh = delivery.customerCart.shipping_addresses[0];
  if (!sameRate(rate, fresh.selected_shipping_method)) {
    if (!fresh.available_shipping_methods.some((candidate) => candidate.available === true && !candidate.error_message
      && candidate.carrier_code === rate.carrier_code && candidate.method_code === rate.method_code
      && sameMoney(candidate.amount, rate.amount))) {
      throw new Error("The original delivery rate is no longer available. Return to delivery.");
    }
    await setShippingMethod(token, cartId, rate.carrier_code, rate.method_code);
    ({ delivery, policy } = await read());
  }
  await resolveLockedDestination(delivery, policy);
  assertQuoteUnchanged(expected, delivery);
  return true;
}
