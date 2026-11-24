import type { CustomerShippingAddress, ShippingCartAddress } from "@/lib/magento/shipping";

// No arbitrary first-address fallback. A previous explicit quote choice wins.
export function defaultSavedAddress(addresses: CustomerShippingAddress[]) {
  const defaults = addresses.filter((address) => address.default_shipping === true);
  const candidate = defaults.length === 1 ? defaults[0]
    : defaults.length === 0 && addresses.length === 1 ? addresses[0] : null;
  return candidate && Number.isSafeInteger(candidate.id) && candidate.id > 0 ? candidate : null;
}

export function soleUnselectedShippingMethod(address: ShippingCartAddress | null) {
  if (!address) return null;
  const available = address.available_shipping_methods.filter((method) => method.available !== false);
  if (available.length !== 1) return null;
  const candidate = available[0];
  if (candidate.available !== true || !candidate.carrier_code || !candidate.method_code || candidate.error_message) return null;
  const selected = address.selected_shipping_method;
  return selected?.carrier_code === candidate.carrier_code && selected.method_code === candidate.method_code
    ? null : candidate;
}
