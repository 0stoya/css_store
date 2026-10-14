"use client";

// Share the PDP image overlay and feature chips through one deferred Magento request.
import { CatalogueProductBadges } from "@/components/catalogue-badges";
import type { ProductBadgeValues } from "@/lib/product-badges";

export function DeferredProductBadges({
  sku,
  initialValues,
}: {
  sku: string;
  initialValues?: ProductBadgeValues;
}) {
  return <CatalogueProductBadges sku={sku} initialValues={initialValues} compact={false}/>;
}
