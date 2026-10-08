import type { CartItemSnapshot } from "@/lib/magento/cart";

export type PunchOutBaseLine = {
  supplierPartId: string; quantity: number; unitPrice: number; currency: string; description: string;
};

export function effectivePunchOutSku(item: Pick<CartItemSnapshot, "product" | "configured_variant">) {
  const sku = item.configured_variant?.sku?.trim() || item.product.sku.trim();
  if (!sku) throw new Error("Magento cart item does not have an effective SKU.");
  return sku;
}

export function punchOutBaseLine(item: CartItemSnapshot): PunchOutBaseLine {
  const money = item.prices?.price;
  if (!money || !Number.isFinite(money.value) || !money.currency) {
    throw new Error("Magento cart item does not have an authoritative unit price.");
  }
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Magento cart item has an invalid quantity.");
  return {
    supplierPartId: effectivePunchOutSku(item),
    quantity: item.quantity,
    unitPrice: money.value,
    currency: money.currency,
    description: item.configured_variant?.name?.trim() || item.product.name.trim(),
  };
}

// UOM, classification/UNSPSC, SupplierPartAuxiliaryID, tax and Extrinsics remain
// deliberately unset until the customer's real SAP test profile proves them.
