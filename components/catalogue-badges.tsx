"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ProductBadges } from "@/components/product-badges";
import type { ProductBadgeValues } from "@/lib/product-badges";

type BadgeMap = Record<string, ProductBadgeValues>;

const CatalogueBadgeContext = createContext<BadgeMap>({});

export function CatalogueBadgeProvider({
  skus,
  children,
}: {
  skus: string[];
  children: ReactNode;
}) {
  const uniqueSkus = useMemo(
    () => Array.from(new Set(skus.map((sku) => sku.trim()).filter(Boolean))),
    [skus],
  );
  const [badges, setBadges] = useState<BadgeMap>({});

  useEffect(() => {
    if (!uniqueSkus.length) return;

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/catalogue/badges", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skus: uniqueSkus }),
        });

        if (response.redirected && new URL(response.url).pathname === "/login") {
          window.location.assign(response.url);
          return;
        }
        if (!response.ok) return;

        const body = await response.json() as { badges?: BadgeMap };
        if (!cancelled) setBadges(body.badges || {});
      } catch {
        // Product badges are optional decoration. Keep the catalogue usable
        // even when Magento cannot resolve these EAV fields.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [uniqueSkus]);

  return <CatalogueBadgeContext.Provider value={badges}>
    {children}
  </CatalogueBadgeContext.Provider>;
}

export function CatalogueProductBadges({
  sku,
  initialValues,
}: {
  sku: string;
  initialValues?: ProductBadgeValues;
}) {
  const deferred = useContext(CatalogueBadgeContext)[sku];

  return <ProductBadges
    values={deferred || initialValues}
    compact
  />;
}
