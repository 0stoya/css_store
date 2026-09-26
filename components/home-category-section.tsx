"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadNavigationCategories } from "@/lib/client/navigation-categories";
import type { MenuCategory } from "@/lib/magento/menu-categories";

export function HomeCategorySection({
  scopeKey,
}: {
  scopeKey: string;
}) {
  const [categories, setCategories] = useState<MenuCategory[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadNavigationCategories(scopeKey)
      .then((result) => {
        if (!cancelled) setCategories(result.slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, [scopeKey]);

  return <section className="home-category-section" aria-labelledby="home-category-heading">
    <div className="home-section-heading">
      <h1 id="home-category-heading">Shop by category</h1>
      <Link href="/catalogue">View all products</Link>
    </div>

    <div className="home-category-grid" aria-busy={categories === null}>
      {categories === null
        ? Array.from({ length: 8 }, (_, index) => <span className="home-category-skeleton" aria-hidden="true" key={index}/>)
        : categories.map((category) => <Link
            className="home-category-link"
            href={`/catalogue/category/${encodeURIComponent(category.url_key || category.uid)}`}
            key={category.uid}
          >
            <span>
              <strong>{category.name}</strong>
              {category.product_count > 0 ? <small>{category.product_count} product{category.product_count === 1 ? "" : "s"}</small> : null}
            </span>
            <ChevronRight size={17} strokeWidth={2.1} aria-hidden="true"/>
          </Link>)}
    </div>
  </section>;
}
