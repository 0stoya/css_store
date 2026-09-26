"use client";

import Link from "next/link";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { ProductImage } from "@/components/product-image";
import type { BasketParentPresentation, BasketProductImage } from "@/lib/magento/cart-images";

type PresentationMap = Record<string, BasketParentPresentation>;

const BasketImageContext = createContext<PresentationMap>({});

export function BasketImageProvider({
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
  const [presentations, setPresentations] = useState<PresentationMap>({});

  useEffect(() => {
    if (!uniqueSkus.length) return;

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/basket/images", {
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

        const body = await response.json() as { presentations?: PresentationMap };
        if (!cancelled) setPresentations(body.presentations || {});
      } catch {
        // Images are optional enrichment; basket content remains usable.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [uniqueSkus]);

  return <BasketImageContext.Provider value={presentations}>
    {children}
  </BasketImageContext.Provider>;
}

function useBasketPresentation(sku: string) {
  return useContext(BasketImageContext)[sku] || null;
}

export function BasketProductMedia({
  lookupSku,
  productSku,
  image,
  productName,
}: {
  lookupSku: string;
  productSku: string;
  image: BasketProductImage | null;
  productName: string;
}) {
  const presentation = useBasketPresentation(lookupSku);
  const hrefSku = presentation?.parent_sku || productSku;
  const displayImage = presentation?.image || image;

  return <Link
    className="basket-product-media"
    href={`/product/${encodeURIComponent(hrefSku)}`}
    aria-label={`View ${productName}`}
  >
    <ProductImage
      src={displayImage?.url}
      alt={displayImage?.label || productName}
      sizes="104px"
    />
  </Link>;
}

export function BasketProductTitleLink({
  lookupSku,
  productSku,
  productName,
}: {
  lookupSku: string;
  productSku: string;
  productName: string;
}) {
  const presentation = useBasketPresentation(lookupSku);
  const hrefSku = presentation?.parent_sku || productSku;

  return <Link href={`/product/${encodeURIComponent(hrefSku)}`}>{productName}</Link>;
}
