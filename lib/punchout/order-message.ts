import type { CartItemSnapshot, CartSnapshot } from "@/lib/magento/cart";
import type { PunchOutProfile } from "@/lib/punchout/config";
import type { PunchOutSession } from "@/lib/punchout/session";

export type PunchOutLine = {
  supplierPartId: string; quantity: number; unitPrice: number; currency: string;
  description: string; uom: string; unspsc?: string; auxiliaryId?: string;
  extrinsics: Record<string, string>;
};
function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
export function effectivePunchOutSku(item: Pick<CartItemSnapshot, "product" | "configured_variant">) {
  const sku = item.configured_variant?.sku?.trim() || item.product.sku.trim();
  if (!sku) throw new Error("Magento item has no effective purchased SKU.");
  return sku;
}
export function punchOutLine(item: CartItemSnapshot, profile: PunchOutProfile): PunchOutLine {
  const sku = effectivePunchOutSku(item);
  const meta = profile.lineMetadata[sku] || {};
  const uom = meta.uom || profile.defaultUom;
  if (!uom) throw new Error("UnitOfMeasure is not verified for SKU " + sku + ".");
  if (profile.requireUnspsc && !meta.unspsc) throw new Error("UNSPSC classification missing for SKU " + sku + ".");
  const money = item.prices?.price;
  if (!money || !Number.isFinite(money.value) || money.value < 0 ||
      !money.currency || !Number.isFinite(item.quantity) || item.quantity <= 0) {
    throw new Error("Magento cart contains invalid unit-price or quantity evidence.");
  }
  const row = item.prices?.row_total;
  if (!row || row.currency !== money.currency || !Number.isFinite(row.value) ||
      Math.abs(row.value - item.quantity * money.value) > 0.011) {
    throw new Error("Magento row pricing does not reconcile to the PunchOut unit price.");
  }
  return {
    supplierPartId: sku, quantity: item.quantity, unitPrice: money.value, currency: money.currency,
    description: item.configured_variant?.name?.trim() || item.product.name.trim(),
    uom, unspsc: meta.unspsc, auxiliaryId: meta.auxiliaryId,
    extrinsics: meta.extrinsics || {},
  };
}
function decimal(value: number) {
  if (!Number.isFinite(value)) throw new Error("Invalid money/quantity value.");
  return String(Number(value.toFixed(6)));
}
export function buildPunchOutOrderMessage(input: {
  cart: CartSnapshot; session: PunchOutSession; profile: PunchOutProfile;
  timestamp: string; payloadId: string;
}) {
  if (!input.cart.itemsV2.items.length || input.cart.itemsV2.items.length > 250) {
    throw new Error("PunchOut requires a non-empty cart of at most 250 lines.");
  }
  if (input.cart.css_company_discount.applied) {
    // Cart-level discounts cannot simply be left out or fabricated as a line price.
    throw new Error("A verified line-level company-discount mapping is required before PunchOut return.");
  }
  if (input.cart.css_purchase_eligibility?.approval_status !== "ALLOWED") {
    throw new Error("The Magento/Fluid basket is not eligible for PunchOut return.");
  }
  const lines = input.cart.itemsV2.items.map((item) => punchOutLine(item, input.profile));
  const currency = lines[0].currency;
  if (lines.some((line) => line.currency !== currency)) throw new Error("PunchOut lines have inconsistent currencies.");
  const total = Number(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0).toFixed(2));
  const entries = lines.map((line) => [
    '<ItemIn quantity="' + xml(decimal(line.quantity)) + '">',
    '<ItemID><SupplierPartID>' + xml(line.supplierPartId) + '</SupplierPartID>',
    line.auxiliaryId ? '<SupplierPartAuxiliaryID>' + xml(line.auxiliaryId) + '</SupplierPartAuxiliaryID>' : "",
    '</ItemID><ItemDetail><UnitPrice><Money currency="' + xml(line.currency) + '">' + xml(decimal(line.unitPrice)) + '</Money></UnitPrice>',
    '<Description xml:lang="en">' + xml(line.description) + '</Description>',
    '<UnitOfMeasure>' + xml(line.uom) + '</UnitOfMeasure>',
    line.unspsc ? '<Classification domain="UNSPSC">' + xml(line.unspsc) + '</Classification>' : "",
    ...Object.entries(line.extrinsics).map(([name, value]) => '<Extrinsic name="' + xml(name) + '">' + xml(value) + '</Extrinsic>'),
    '</ItemDetail></ItemIn>',
  ].join("")).join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<cXML payloadID="' + xml(input.payloadId) + '" timestamp="' + xml(input.timestamp) + '">',
    '<Message deploymentMode="production" inReplyTo="' + xml(input.session.payloadId) + '">',
    '<PunchOutOrderMessage><BuyerCookie>' + xml(input.session.buyerCookie) + '</BuyerCookie>',
    '<PunchOutOrderMessageHeader operationAllowed="create"><Total><Money currency="' + xml(currency) + '">' +
      xml(total.toFixed(2)) + '</Money></Total></PunchOutOrderMessageHeader>',
    entries,
    '</PunchOutOrderMessage></Message></cXML>',
  ].join("");
}
