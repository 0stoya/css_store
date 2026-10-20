import {
  getAssignedEmployeeDeliveryAddress,
  getControlledEmployeeDeliveryEnabled,
} from "@/lib/employee-delivery-address";
import {
  getDeliveryContext,
  type CustomerShippingAddress,
  type DeliveryContext,
  type ShippingCartAddress,
} from "@/lib/magento/shipping";

function positive(value: number | null | undefined): number {
  if (!Number.isSafeInteger(value) || !value || value <= 0) {
    throw new Error("The selected customer and company must be verified before checkout.");
  }
  return value;
}

function compact(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function comparable(value: string | null | undefined) {
  return compact(value).toLowerCase();
}

function physicalStreet(street: string[]) {
  return street.map(compact).filter(Boolean);
}

export function isSingleEmployeeCompany(delivery: DeliveryContext) {
  const configuration = delivery.css_company_employee_configuration;
  return configuration.uses_employee && !configuration.multi_employee_basket;
}

// Canonical Magento uses_employee is required as well as our local opt-in.
// Missing policy-table permissions / DB outages throw (fail closed) for single
// Employee checkout; no native-address list should be rendered in that state.
export async function controlledDeliveryApplies(delivery: DeliveryContext) {
  if (!isSingleEmployeeCompany(delivery)) return false;
  const companyId = positive(delivery.css_company_context.selected_company_id);
  return getControlledEmployeeDeliveryEnabled(companyId);
}

// Full-cart Employee attribution is required. Never trust form-submitted IDs.
export function selectedCartEmployeeId(delivery: DeliveryContext): number | null {
  const items = delivery.customerCart.itemsV2.items;
  if (!items.length) return null;
  const assigned = items.map((item) => item.css_employee?.employee_id ?? item.css_kit?.employee_id ?? null);
  const first = assigned[0];
  if (!Number.isSafeInteger(first) || !first || first <= 0) return null;
  return assigned.every((id) => id === first) ? first : null;
}

export async function assignedOwnedAddress(
  delivery: DeliveryContext,
  employeeId: number,
): Promise<CustomerShippingAddress | null> {
  const companyId = positive(delivery.css_company_context.selected_company_id);
  const customerId = positive(delivery.css_company_context.customer_id);
  const id = positive(employeeId);
  const mappedId = await getAssignedEmployeeDeliveryAddress(companyId, customerId, id);
  if (mappedId === null) return null;
  // A manager's mapping never authorises an unrelated customer's address.
  return delivery.customer.addresses.find((item) => item.id === mappedId) ?? null;
}

export function recipientName(raw: string): string {
  if (/[\u0000-\u001f\u007f<>]/u.test(raw)) {
    throw new Error("Enter a recipient name on one line without control characters.");
  }
  const value = compact(raw);
  if (value.length < 2 || value.length > 80 || /^attn\s*:/i.test(value)) {
    throw new Error("Enter the delivery recipient's name (2–80 characters).");
  }
  return value;
}

// Cart-only shipping address. The manager's permanent Magento saved address
// remains untouched. The original physical street lines are preserved.
export function cartOnlyRecipientAddress(saved: CustomerShippingAddress, name: string) {
  const recipient = recipientName(name);
  const street = physicalStreet(saved.street);
  if (!street.length) throw new Error("The assigned Magento address has no street.");
  return {
    firstname: saved.firstname,
    lastname: saved.lastname,
    ...(saved.company ? { company: saved.company } : {}),
    street: [`Attn: ${recipient}`, ...street],
    city: saved.city,
    ...(saved.region?.region ? { region: saved.region.region } : {}),
    postcode: saved.postcode,
    country_code: saved.country_code,
    telephone: saved.telephone,
    save_in_address_book: false as const,
  };
}

export function confirmedCartRecipient(
  saved: CustomerShippingAddress,
  cart: ShippingCartAddress | null | undefined,
): string | null {
  if (!cart) return null;
  const street = physicalStreet(cart.street);
  const original = physicalStreet(saved.street);
  if (street.length !== original.length + 1) return null;
  const match = street[0]?.match(/^Attn: (.+)$/i);
  if (!match) return null;
  let name: string;
  try {
    name = recipientName(match[1]);
  } catch {
    return null;
  }
  if (!street.slice(1).every((line, i) => comparable(line) === comparable(original[i]))) return null;
  if (comparable(cart.firstname) !== comparable(saved.firstname)
    || comparable(cart.lastname) !== comparable(saved.lastname)
    || comparable(cart.company) !== comparable(saved.company)
    || comparable(cart.city) !== comparable(saved.city)
    || comparable(cart.postcode) !== comparable(saved.postcode)
    || comparable(cart.country?.code) !== comparable(saved.country_code)
    || comparable(cart.telephone) !== comparable(saved.telephone)) return null;
  return name;
}

export async function assertControlledCartReady(token: string, cartId: string) {
  const delivery = await getDeliveryContext(token);
  const enabled = await controlledDeliveryApplies(delivery);
  if (!enabled) return { controlled: false as const };
  if (delivery.customerCart.id !== cartId) {
    throw new Error("Your basket changed. Review your Employee delivery again.");
  }
  const employeeId = selectedCartEmployeeId(delivery);
  if (employeeId === null) throw new Error("Select an active Employee before confirming delivery.");
  const address = await assignedOwnedAddress(delivery, employeeId);
  if (!address) {
    throw new Error("This Employee has no assigned delivery address. Contact your company administrator.");
  }
  const recipient = confirmedCartRecipient(address, delivery.customerCart.shipping_addresses[0]);
  if (!recipient) {
    throw new Error("Enter the recipient's name and confirm this Employee's assigned delivery address.");
  }
  return { controlled: true as const, addressId: address.id, recipient, employeeId };
}
