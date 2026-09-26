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

export type ProductCustomAttribute = {
  code: string;
  value?: string | null;
  selected_options?: Array<{
    label: string;
    value: string;
  }> | null;
};

export type ProductCustomAttributes = {
  items: Array<ProductCustomAttribute | null>;
} | null;

const TRUTHY_ATTRIBUTE_VALUES = new Set([
  "1",
  "true",
  "yes",
  "on",
  "enabled",
]);

function normalise(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function isTruthyAttribute(attribute: ProductCustomAttribute) {
  if (TRUTHY_ATTRIBUTE_VALUES.has(normalise(attribute.value))) return true;

  return (attribute.selected_options || []).some((option) =>
    TRUTHY_ATTRIBUTE_VALUES.has(normalise(option.value))
    || TRUTHY_ATTRIBUTE_VALUES.has(normalise(option.label)),
  );
}

export function getActiveProductBadgeCodes(
  attributes: ProductCustomAttributes | undefined,
): ProductBadgeCode[] {
  const enabled = new Set<ProductBadgeCode>();

  for (const attribute of attributes?.items || []) {
    if (!attribute) continue;
    if (!PRODUCT_BADGE_CODES.includes(attribute.code as ProductBadgeCode)) continue;
    if (!isTruthyAttribute(attribute)) continue;

    enabled.add(attribute.code as ProductBadgeCode);
  }

  // Express is the stronger customer promise. Avoid displaying two delivery
  // chips that communicate almost the same thing.
  if (enabled.has("express_delivery")) enabled.delete("fast_delivery");

  return PRODUCT_BADGE_CODES.filter((code) => enabled.has(code));
}
