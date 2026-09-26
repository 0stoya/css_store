"use client";

import { useEffect, useState } from "react";
import { ProductBadges } from "@/components/product-badges";
import type { ProductBadgeValues } from "@/lib/product-badges";

export function DeferredProductBadges({
  sku,
  initialValues,
}: {
  sku: string;
  initialValues?: ProductBadgeValues;
}) {
  const [values, setValues] = useState<ProductBadgeValues | undefined>(initialValues);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/catalogue/badges", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skus: [sku] }),
        });

        if (response.redirected && new URL(response.url).pathname === "/login") {
          window.location.assign(response.url);
          return;
        }
        if (!response.ok) return;

        const body = await response.json() as {
          badges?: Record<string, ProductBadgeValues>;
        };
        if (!cancelled) setValues(body.badges?.[sku] || initialValues);
      } catch {
        // Badges are optional presentation metadata.
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [initialValues, sku]);

  return <ProductBadges values={values}/>;
}
