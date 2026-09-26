export const PRODUCT_BADGE_CODES = [
  "ppe_certified",
  "express_delivery",
  "fast_delivery",
  "made_to_order",
  "company_logo",
  "embroidered",
  "printed",
] as const;

export type ProductBadgeCode = (typeof PRODUCT_BADGE_CODES)[number];

export type ProductBadgeValues = Partial<
  Record<ProductBadgeCode, string | number | boolean | null>
>;

const TRUTHY_ATTRIBUTE_VALUES = new Set([
  "1",
  "true",
  "yes",
  "on",
  "enabled",
]);

function normalise(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

export function getActiveProductBadgeCodes(
  values: ProductBadgeValues | undefined,
): ProductBadgeCode[] {
  const enabled = new Set<ProductBadgeCode>();

  for (const code of PRODUCT_BADGE_CODES) {
    if (TRUTHY_ATTRIBUTE_VALUES.has(normalise(values?.[code]))) {
      enabled.add(code);
    }
  }

  // Express is the stronger customer promise. Avoid displaying two delivery
  // chips that communicate almost the same thing.
  if (enabled.has("express_delivery")) enabled.delete("fast_delivery");

  return PRODUCT_BADGE_CODES.filter((code) => enabled.has(code));
}
