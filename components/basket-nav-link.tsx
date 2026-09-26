"use client";

import { ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function BasketNavLink({
  initialQuantity,
}: {
  initialQuantity?: number;
}) {
  const [quantity, setQuantity] = useState<number | undefined>(initialQuantity);

  useEffect(() => {
    if (initialQuantity !== undefined) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/basket/summary", {
          credentials: "same-origin",
          cache: "no-store",
        });

        if (response.redirected && new URL(response.url).pathname === "/login") {
          window.location.assign(response.url);
          return;
        }
        if (!response.ok) return;

        const body = await response.json() as { total_quantity?: number };
        if (!cancelled && typeof body.total_quantity === "number") {
          setQuantity(body.total_quantity);
        }
      } catch {
        // Basket count is secondary navigation metadata. Keep the link usable
        // even when its background refresh cannot complete.
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [initialQuantity]);

  return <Link className="store-nav-link" href="/basket">
    <ShoppingBasket size={16} strokeWidth={2.1} aria-hidden="true"/>
    <span>Basket{typeof quantity === "number" && quantity > 0 ? ` (${quantity})` : ""}</span>
  </Link>;
}
