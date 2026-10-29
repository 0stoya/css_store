import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const entryToken = "A".repeat(43);
const browserToken = "B".repeat(43);
const profile = {
  id: "buyer_alpha",
  companyId: 50,
  customerIds: [101],
  storeCode: "default",
};

class NextResponse {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status ?? 200;
    this.headers = options.headers ?? {};
  }
}

function createStartPageHarness(authMode = "fluid_exchange") {
  const calls = [];
  let ready = false;
  let used = false;
  const config = {
    enabled: true,
    authMode,
    profiles: [profile],
    sessionDbPath: "unused",
    sessionTtlSeconds: 1800,
  };
  const pending = {
    profileId: profile.id,
    companyId: profile.companyId,
    storeCode: profile.storeCode,
    customerId: 101,
    expiresAt: Date.now() + 300000,
  };

  class PunchOutSessionStore {
    peekEntry(value) {
      calls.push("peek");
      assert.equal(value, entryToken);
      return used ? null : pending;
    }
    consumeEntryToken(value) {
      calls.push("consume");
      assert.equal(value, entryToken);
      if (used) throw new Error("StartPage token already consumed.");
      used = true;
      return {session: pending, browserToken};
    }
    close() { calls.push("close"); }
  }
  const route = load(root, "app/punchout/session/[token]/route.ts", {
    "next/server": {NextResponse},
    "@/lib/session": {
      getCustomerToken: async () => {
        calls.push("get-token");
        return "existing-token";
      },
      setCustomerToken: async (token) => {
        calls.push("set-token");
        assert.equal(token, "new-technical-token");
      },
    },
    "@/lib/punchout/browser-session": {
      setPunchOutBrowserToken: async (token) => {
        calls.push("set-browser");
        assert.equal(token, browserToken);
      },
    },
    "@/lib/punchout/config": {getPunchOutConfig: () => config},
    "@/lib/punchout/customer-session": {
      clearLeasedPunchOutCart: async () => calls.push("clear-cart"),
      verifyPunchOutCustomerToken: async () => calls.push("verify"),
    },
    "@/lib/punchout/fluid-session": {
      assertPunchOutMagentoGraphQlReady: async () => {
        calls.push("readiness");
        if (!ready) throw new Error("Magento GraphQL is unavailable.");
      },
      exchangePunchOutCustomerSession: async () => {
        calls.push("exchange");
        return "new-technical-token";
      },
    },
    "@/lib/punchout/session": {PunchOutSessionStore},
  });

  return {
    calls,
    setReady: (value) => {ready = value;},
    getUsed: () => used,
    enter: () => route.GET({}, {params: Promise.resolve({token: entryToken})}),
  };
}

test("Magento preflight failure preserves one-use StartPage token; retry works", async () => {
  const harness = createStartPageHarness();
  const first = await harness.enter();
  assert.equal(first.status, 503);
  assert.equal(harness.getUsed(), false);
  assert.deepEqual(harness.calls, ["peek", "readiness", "close"]);

  harness.setReady(true);
  const second = await harness.enter();
  assert.equal(second.status, 303);
  assert.equal(harness.getUsed(), true);
  assert.deepEqual(harness.calls, [
    "peek", "readiness", "close",
    "peek", "readiness", "consume", "close",
    "get-token", "exchange", "verify", "clear-cart", "set-token", "set-browser",
  ]);
  const third = await harness.enter();
  assert.equal(third.status, 410);
  assert.equal(harness.calls.filter((call) => call === "consume").length, 1);
});

test("development preauthenticated StartPage does not depend on Magento preflight", async () => {
  const harness = createStartPageHarness("preauthenticated");
  const result = await harness.enter();
  assert.equal(result.status, 303);
  assert.equal(harness.getUsed(), true);
  assert.ok(harness.calls.includes("verify"));
  assert.ok(!harness.calls.includes("readiness"));
  assert.ok(!harness.calls.includes("exchange"));
});

test("readiness helper uses anonymous read-only GraphQL, never the session mutation", async () => {
  const calls = [];
  const runtime = load(root, "lib/punchout/fluid-session.ts", {
    "node:crypto": crypto,
    "@/lib/magento/client": {
      magentoGraphQL: async (...args) => {
        calls.push(args);
        return {__typename: "Query"};
      },
    },
    "@/lib/magento/context": {selectCompany: () => {throw new Error("unexpected");}},
    "@/lib/punchout/customer-session": {getFreshPunchOutContext: () => {throw new Error("unexpected");}},
  });
  await runtime.assertPunchOutMagentoGraphQlReady();
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^query PunchOutStartPageReadiness/);
  assert.match(calls[0][0], /\{\s*__typename\s*\}/);
  assert.equal(calls[0].length, 1);
  assert.doesNotMatch(calls[0][0], /mutation|assertion|css_punchout_customer_session/i);
});
