import type { MenuCategory } from "@/lib/magento/menu-categories";

type CacheEntry = {
  expiresAt: number;
  promise: Promise<MenuCategory[]>;
};

const TTL_MS = 60_000;
const categoryCache = new Map<string, CacheEntry>();

export function loadNavigationCategories(scopeKey: string) {
  const key = scopeKey || "customer";
  const now = Date.now();
  const existing = categoryCache.get(key);

  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = fetch("/api/navigation/categories", {
    credentials: "same-origin",
    cache: "no-store",
  }).then(async (response) => {
    if (response.redirected && new URL(response.url).pathname === "/login") {
      window.location.assign(response.url);
      return [];
    }
    if (!response.ok) throw new Error("Category navigation request failed.");

    const body = await response.json() as { categories?: MenuCategory[] };
    return body.categories || [];
  }).catch((error) => {
    categoryCache.delete(key);
    throw error;
  });

  categoryCache.set(key, {
    expiresAt: now + TTL_MS,
    promise,
  });

  return promise;
}
