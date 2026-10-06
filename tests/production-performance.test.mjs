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
