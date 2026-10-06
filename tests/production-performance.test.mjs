import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Store image optimizer favors fast repeat delivery with bounded disk use", () => {
  const config = source("next.config.ts");

  assert.match(config, /formats:\s*\["image\/webp"\]/);
  assert.match(config, /minimumCacheTTL:\s*14400/);
  assert.match(config, /maximumDiskCacheSize:\s*1_000_000_000/);
});

test("Store nginx enables HTTP\/2 and preserves App Router streaming", () => {
  const nginx = source("deploy/nginx/store.csscdn.co.uk.conf");

  assert.match(nginx, /listen 443 ssl http2;/);
  assert.match(nginx, /listen \[::\]:443 ssl http2;/);
  assert.match(nginx, /proxy_buffering off;/);
});

test("Store navigation caches only store-wide category metadata", () => {
  const menu = source("lib/magento/menu-categories.ts");

  assert.match(menu, /RAW_MENU_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(menu, /__cssStoreRawMenuCategories/);
  assert.match(menu, /const rawCategories = await loadRawMenuCategories\(token\)/);
  assert.match(menu, /const productCounts = await getCustomerCategoryProductCounts\(token\)/);
  assert.match(menu, /Customer-specific visibility and[\s\S]*recomputed/);
});

test("expensive Account bootstrap is not prefetched from every Store header", () => {
  const header = source("components/site-header.tsx");

  assert.match(header, /href="\/account" prefetch=\{false\}/);
});

test("customer context is memoized only within the current server render", () => {
  const context = source("lib/magento/context.ts");

  assert.match(context, /import \{ cache \} from "react"/);
  assert.match(context, /getCustomerContext = cache/);
});
