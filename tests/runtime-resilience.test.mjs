import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("store GraphQL timeout remains bounded and configurable", () => {
  const client = source("lib/magento/client.ts");

  assert.match(client, /MAGENTO_GRAPHQL_TIMEOUT_MS/);
  assert.match(client, /AbortSignal\.timeout\(graphQLTimeoutMs\(\)\)/);
  assert.match(client, /value >= 1000 && value <= 60000/);
  assert.match(client, /MAGENTO_GRAPHQL_TIMING/);
});

test("health route is dependency-free and explicitly non-cacheable", () => {
  const health = source("app/api/health/route.ts");

  assert.match(health, /status:\s*"ok"/);
  assert.match(health, /service:\s*"css-store"/);
  assert.match(health, /Cache-Control/);
  assert.doesNotMatch(health, /fetch\(/);
});

test("PM2 backs off restart loops while retaining the memory ceiling", () => {
  const ecosystem = source("ecosystem.config.cjs");

  assert.match(ecosystem, /max_memory_restart:\s*"512M"/);
  assert.match(ecosystem, /exp_backoff_restart_delay:\s*100/);
});
