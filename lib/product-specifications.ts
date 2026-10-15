/* Parent-level Magento attributes: informational, never ordering authority. */
export const PRODUCT_SPECIFICATION_CODES = [
  "safety_rating",
  "safety_classification",
  "snr_db",
  "fabric",
  "shell_fabric",
  "lining",
  "catalogue_weight",
  "material",
  "pack_qty",
  "case_qty",
] as const;

export type ProductSpecificationCode = (typeof PRODUCT_SPECIFICATION_CODES)[number];
export type ProductSpecificationValue = string | number | boolean | null | undefined;
export type ProductSpecificationValues = Partial<
  Record<ProductSpecificationCode, ProductSpecificationValue>
>;

export type ProductSpecificationEntry = {
  code: ProductSpecificationCode;
  label: string;
  value: string;
};

export type ProductSpecificationSection = {
  code: "safety" | "materials" | "packaging";
  title: string;
  entries: ProductSpecificationEntry[];
};

const SECTIONS = [
  {
    code: "safety",
    title: "Safety & protection",
    fields: [
      { code: "safety_rating", label: "Standards & ratings" },
      { code: "safety_classification", label: "Safety classification" },
      { code: "snr_db", label: "Noise reduction (SNR)" },
    ],
  },
  {
    code: "materials",
    title: "Materials & construction",
    fields: [
      { code: "fabric", label: "Fabric" },
      { code: "shell_fabric", label: "Shell fabric" },
      { code: "lining", label: "Lining" },
      // Values also contain grams and kilograms; do not mislabel them as GSM.
      { code: "catalogue_weight", label: "Weight" },
      { code: "material", label: "Material" },
    ],
  },
  {
    code: "packaging",
    title: "Packaging & quantities",
    fields: [
      { code: "pack_qty", label: "Pack quantity" },
      { code: "case_qty", label: "Case quantity" },
    ],
  },
] as const satisfies ReadonlyArray<{
  code: ProductSpecificationSection["code"];
  title: string;
  fields: ReadonlyArray<{ code: ProductSpecificationCode; label: string }>;
}>;

// Allow legitimate quantity formats while excluding malformed exported content,
// such as "100 • Sizes: 7–11 ..." and placeholder strings.
// These attributes never enforce minimum quantities or ordering increments.
const PACK_QUANTITY_PATTERN =
  /^[1-9]\d{0,5}(?:\s*[x×]\s*[1-9]\d{0,5})?(?:\s*(?:ml|l|litres?|g|kg|pairs?|pr|pcs?|pieces?|capsules?|bottles?|packs?|units?))?$/i;

function cleanText(value: ProductSpecificationValue): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || /^(?:n\/?a|none|null|undefined|false|no|0|[-–—]+)$/i.test(text)) return null;
  return text;
}

export function formatProductSpecification(
  code: ProductSpecificationCode,
  raw: ProductSpecificationValue,
): string | null {
  const text = cleanText(raw);
  if (!text) return null;

  if (code === "pack_qty" || code === "case_qty") {
    return PACK_QUANTITY_PATTERN.test(text) ? text : null;
  }

  if (code === "snr_db") {
    const match = text.match(/^(?:SNR\s*)?(\d{1,2}(?:\.\d)?)\s*(?:dB)?$/i);
    if (!match) return null;
    const snr = Number(match[1]);
    return snr > 0 && snr <= 60 ? String(snr) + " dB" : null;
  }

  if (code === "catalogue_weight") {
    // A unitless number is ambiguous: never assume grams, kg or GSM.
    return /(?:gsm|kg|g|oz|grams?|kilograms?)\b/i.test(text) ? text : null;
  }

  // Numeric-only values may be Magento select option IDs rather than labels.
  // Preserve the original text of standard/classification fields; no inference.
  if (/^\d+$/.test(text)) return null;
  return text;
}

export function getProductSpecificationSections(
  values: ProductSpecificationValues | undefined | null,
): ProductSpecificationSection[] {
  if (!values) return [];

  return SECTIONS.flatMap((section) => {
    const entries: ProductSpecificationEntry[] = section.fields.flatMap(({ code, label }) => {
      const value = formatProductSpecification(code, values[code]);
      return value ? [{ code, label, value }] : [];
    });

    return entries.length ? [{
      code: section.code,
      title: section.title,
      entries,
    }] : [];
  });
}
