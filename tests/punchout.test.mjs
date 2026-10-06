import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as crypto from "node:crypto";
import * as nodePath from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SaxesParser } from "saxes";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const now = Date.parse("2026-10-06T16:30:00Z");
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function config(overrides = {}) {
  return {
    enabled: true,
    authMode: "fluid_exchange",
    credentials: {
      from: { domain: "NetworkID", identity: "buyer-test" },
      to: { domain: "NetworkID", identity: "supplier-test" },
      sender: { domain: "NetworkID", identity: "sender-test" },
    },
    sharedSecret: "synthetic-shared-secret",
    magentoCustomerId: 42,
    companyId: 5437,
    storeCode: "default",
    allowedReturnHosts: ["buyer.test"],
    sessionDbPath: "/tmp/css-store-punchout-test.sqlite",
    sessionTtlSeconds: 1800,
    maxClockSkewSeconds: 300,
    maxBodyBytes: 262144,
    storeOrigin: "https://store.example.test",
    assertion: {
      privateKeyPem,
      issuer: "css-store-punchout",
      audience: "css-commerce",
      keyId: "css-store-punchout-v1",
      ttlSeconds: 60,
    },
    ...overrides,
  };
}

const fixture = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE cXML SYSTEM "https://xml.cxml.org/schemas/cXML/1.2.067/cXML.dtd">',
  '<cXML payloadID="fixture-1@buyer.test" timestamp="2026-10-06T16:30:00Z" version="1.2.067">',
  "<Header>",
  '<From><Credential domain="NetworkID"><Identity>buyer-test</Identity></Credential></From>',
  '<To><Credential domain="NetworkID"><Identity>supplier-test</Identity></Credential></To>',
  '<Sender><Credential domain="NetworkID"><Identity>sender-test</Identity><SharedSecret>synthetic-shared-secret</SharedSecret></Credential><UserAgent>Synthetic test</UserAgent></Sender>',
  "</Header>",
  '<Request><PunchOutSetupRequest operation="create">',
  "<BuyerCookie>synthetic-cookie</BuyerCookie>",
  "<BrowserFormPost><URL>https://buyer.test/punchout/return?x=1&amp;y=2</URL></BrowserFormPost>",
  "</PunchOutSetupRequest></Request>",
  "</cXML>",
].join("");

const cxml = load(root, "lib/punchout/cxml.ts", { saxes: { SaxesParser } });
const security = load(root, "lib/punchout/security.ts", { "node:crypto": crypto });
const http = load(root, "lib/punchout/http.ts");

test("synthetic cXML setup request parses external DTD without resolving it", () => {
  const request = cxml.parsePunchOutSetupRequest(fixture);
  assert.equal(request.payloadId, "fixture-1@buyer.test");
  assert.equal(request.version, "1.2.067");
  assert.equal(request.from.identity, "buyer-test");
  assert.equal(request.sender.sharedSecret, "synthetic-shared-secret");
  assert.equal(request.operation, "create");
  assert.equal(request.buyerCookie, "synthetic-cookie");
  assert.equal(request.browserFormPost, "https://buyer.test/punchout/return?x=1&y=2");
});

test("cXML parser rejects internal DTD/entity declarations", () => {
  const malicious = fixture.replace(
    '<!DOCTYPE cXML SYSTEM "https://xml.cxml.org/schemas/cXML/1.2.067/cXML.dtd">',
    '<!DOCTYPE cXML [<!ENTITY x "boom">]>',
  );
  assert.throws(() => cxml.parsePunchOutSetupRequest(malicious), /DTD|entity/i);
});

test("setup validation binds all configured credentials, timestamp and callback host", () => {
  const validated = security.validatePunchOutSetup(cxml.parsePunchOutSetupRequest(fixture), config(), now);
  assert.equal(validated.browserFormPost, "https://buyer.test/punchout/return?x=1&y=2");
});

test("setup validation rejects a wrong SharedSecret without accepting the sender", () => {
  const request = cxml.parsePunchOutSetupRequest(fixture);
  request.sender.sharedSecret = "wrong";
  assert.throws(() => security.validatePunchOutSetup(request, config(), now), /Sender credential/);
});

test("setup validation rejects stale timestamps", () => {
  const request = cxml.parsePunchOutSetupRequest(fixture);
  assert.throws(() => security.validatePunchOutSetup(request, config(), now + 301000), /clock window/);
});

for (const callback of ["http://buyer.test/return", "https://evil.test/return", "https://buyer.test:8443/return"]) {
  test("callback allowlist rejects " + callback, () => {
    assert.throws(() => security.validateBrowserFormPost(callback, ["buyer.test"]));
  });
}

test("status response never needs to echo credential-bearing request XML", () => {
  const response = cxml.buildPunchOutStatusResponse({
    payloadId: "error-response",
    timestamp: "2026-10-06T16:30:01Z",
    code: 400,
    text: "Bad Request",
    message: "The PunchOut request was not accepted.",
  });
  assert.match(response, /code="400"/);
  assert.doesNotMatch(response, /SharedSecret|synthetic-shared-secret/);
});

test("request body limit is enforced even without Content-Length", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("12345"));
      controller.enqueue(encoder.encode("67890"));
      controller.close();
    },
  });
  await assert.rejects(
    () => http.readBoundedTextBody({ body, text: async () => "unused" }, 9),
    /too large/,
  );
});

test("setup response XML escapes the fixed StartPage URL", () => {
  const response = cxml.buildPunchOutSetupResponse({
    payloadId: "response-1",
    timestamp: "2026-10-06T16:30:01Z",
    version: "1.2.067",
    startPageUrl: "https://store.example.test/punchout/session/token?a=1&b=2",
  });
  assert.match(response, /PunchOutSetupResponse/);
  assert.match(response, /a=1&amp;b=2/);
  assert.doesNotMatch(response, /SharedSecret/);
});

test("disabled PunchOut config requires no customer or SAP values", () => {
  const configModule = load(root, "lib/punchout/config.ts", { "node:path": nodePath });
  assert.equal(configModule.getPunchOutConfig({ SAP_PUNCHOUT_ENABLED: "0" }).enabled, false);
});

test("enabled PunchOut config fails closed when exact customer mapping is absent", () => {
  const configModule = load(root, "lib/punchout/config.ts", { "node:path": nodePath });
  assert.throws(() => configModule.getPunchOutConfig({ SAP_PUNCHOUT_ENABLED: "1" }), /required/);
});

function preauthEnv(overrides = {}) {
  return {
    NODE_ENV: "development",
    SAP_PUNCHOUT_ENABLED: "1",
    SAP_PUNCHOUT_AUTH_MODE: "preauthenticated",
    SAP_PUNCHOUT_FROM_DOMAIN: "NetworkID",
    SAP_PUNCHOUT_FROM_IDENTITY: "buyer-test",
    SAP_PUNCHOUT_TO_DOMAIN: "NetworkID",
    SAP_PUNCHOUT_TO_IDENTITY: "supplier-test",
    SAP_PUNCHOUT_SENDER_DOMAIN: "NetworkID",
    SAP_PUNCHOUT_SENDER_IDENTITY: "sender-test",
    SAP_PUNCHOUT_SHARED_SECRET: "synthetic-shared-secret",
    SAP_PUNCHOUT_MAGENTO_CUSTOMER_ID: "42",
    SAP_PUNCHOUT_COMPANY_ID: "5437",
    SAP_PUNCHOUT_STORE_CODE: "default",
    SAP_PUNCHOUT_ALLOWED_RETURN_HOSTS: "buyer.test",
    SAP_PUNCHOUT_STORE_ORIGIN: "http://localhost:3000",
    SAP_PUNCHOUT_SESSION_DB_PATH: "/tmp/css-store-punchout-test.sqlite",
    ...overrides,
  };
}

test("preauthenticated auth mode works in development without a Fluid signing key", () => {
  const configModule = load(root, "lib/punchout/config.ts", { "node:path": nodePath });
  const result = configModule.getPunchOutConfig(preauthEnv());
  assert.equal(result.enabled, true);
  assert.equal(result.authMode, "preauthenticated");
  assert.equal(result.assertion, null);
});

test("preauthenticated auth mode is forbidden in production", () => {
  const configModule = load(root, "lib/punchout/config.ts", { "node:path": nodePath });
  assert.throws(
    () => configModule.getPunchOutConfig(preauthEnv({ NODE_ENV: "production", SAP_PUNCHOUT_STORE_ORIGIN: "https://store.example.test" })),
    /forbidden in production/,
  );
});

test("fluid_exchange mode still requires the private signing key", () => {
  const configModule = load(root, "lib/punchout/config.ts", { "node:path": nodePath });
  assert.throws(
    () => configModule.getPunchOutConfig({
      ...preauthEnv({ SAP_PUNCHOUT_AUTH_MODE: "fluid_exchange" }),
    }),
    /SAP_PUNCHOUT_ASSERTION_PRIVATE_KEY_B64/,
  );
});

test("durable session store enforces replay, one active cart principal, one-use entry and one return", () => {
  const sessionModule = load(root, "lib/punchout/session.ts", {
    "node:crypto": crypto,
    "node:sqlite": { DatabaseSync },
  });
  const store = new sessionModule.PunchOutSessionStore(":memory:");
  const setup = security.validatePunchOutSetup(cxml.parsePunchOutSetupRequest(fixture), config(), now);
  const created = store.create(setup, config(), now);
  assert.match(created.entryToken, /^[A-Za-z0-9_-]{43}$/);
  assert.throws(() => store.create(setup, config(), now), /payloadID/);

  const concurrent = { ...setup, payloadId: "fixture-2@buyer.test" };
  assert.throws(() => store.create(concurrent, config(), now), /already active/);

  const active = store.consumeEntryToken(created.entryToken, now + 1000);
  assert.equal(active.session.status, "ACTIVE");
  assert.equal(active.session.customerId, 42);
  assert.equal(active.session.companyId, 5437);
  assert.throws(() => store.consumeEntryToken(created.entryToken, now + 2000), /invalid or expired/);
  assert.equal(store.getActiveByBrowserToken(active.browserToken, now + 2000)?.id, created.id);

  const returned = store.markReturned(active.browserToken, now + 3000);
  assert.equal(returned.status, "RETURNED");
  assert.equal(store.getActiveByBrowserToken(active.browserToken, now + 4000), null);
  assert.throws(() => store.markReturned(active.browserToken, now + 4000), /already returned/);

  const next = store.create(concurrent, config(), now + 5000);
  assert.match(next.entryToken, /^[A-Za-z0-9_-]{43}$/);
  store.close();
});

test("payloadID replay survives browser-session expiry for the full timestamp acceptance window", () => {
  const sessionModule = load(root, "lib/punchout/session.ts", {
    "node:crypto": crypto,
    "node:sqlite": { DatabaseSync },
  });
  const store = new sessionModule.PunchOutSessionStore(":memory:");
  const longSkew = config({ sessionTtlSeconds: 300, maxClockSkewSeconds: 900 });
  const setup = security.validatePunchOutSetup(cxml.parsePunchOutSetupRequest(fixture), longSkew, now);
  store.create(setup, longSkew, now);

  assert.throws(
    () => store.create(setup, longSkew, now + 400000),
    /payloadID/,
  );

  const newPayload = { ...setup, payloadId: "fixture-after-expiry@buyer.test" };
  assert.doesNotThrow(() => store.create(newPayload, longSkew, now + 400000));
  store.close();
});

test("effective SAP SupplierPartID is the configured variant SKU when present", () => {
  const order = load(root, "lib/punchout/order-message.ts");
  assert.equal(order.effectivePunchOutSku({ product: { sku: "PARENT" }, configured_variant: { sku: "CHILD" } }), "CHILD");
  assert.equal(order.effectivePunchOutSku({ product: { sku: "SIMPLE" }, configured_variant: null }), "SIMPLE");
});

test("preauthenticated customer verification requires exact selected company and empty cart", async () => {
  const customer = load(root, "lib/punchout/customer-session.ts", {
    "@/lib/magento/context": {
      getCustomerContext: async () => ({
        css_company_context: {
          authenticated: true,
          customer_id: 42,
          selected_company_id: 5437,
          companies: [{ company_id: 5437, active: true }],
        },
        css_ordering_capabilities: {
          authenticated: true,
          company_context: true,
          company_id: 5437,
          company_active: true,
        },
      }),
    },
    "@/lib/magento/cart": {
      getCustomerCartSummary: async () => ({ total_quantity: 0, itemsV2: { items: [] } }),
      cartHasItems: (cart) => cart.total_quantity > 0 || cart.itemsV2.items.length > 0,
    },
  });

  await assert.doesNotReject(() =>
    customer.verifyPunchOutCustomerToken(config(), "token", { requireEmptyCart: true }),
  );
});

test("preauthenticated customer verification rejects a stale Magento basket", async () => {
  const customer = load(root, "lib/punchout/customer-session.ts", {
    "@/lib/magento/context": {
      getCustomerContext: async () => ({
        css_company_context: {
          authenticated: true,
          customer_id: 42,
          selected_company_id: 5437,
          companies: [{ company_id: 5437, active: true }],
        },
        css_ordering_capabilities: {
          authenticated: true,
          company_context: true,
          company_id: 5437,
          company_active: true,
        },
      }),
    },
    "@/lib/magento/cart": {
      getCustomerCartSummary: async () => ({ total_quantity: 1, itemsV2: { items: [{ uid: "old-line" }] } }),
      cartHasItems: (cart) => cart.total_quantity > 0 || cart.itemsV2.items.length > 0,
    },
  });

  await assert.rejects(
    () => customer.verifyPunchOutCustomerToken(config(), "token", { requireEmptyCart: true }),
    /must be empty/,
  );
});

test("preauthenticated customer verification rejects a different selected company", async () => {
  const customer = load(root, "lib/punchout/customer-session.ts", {
    "@/lib/magento/context": {
      getCustomerContext: async () => ({
        css_company_context: {
          authenticated: true,
          customer_id: 42,
          selected_company_id: 9999,
          companies: [{ company_id: 5437, active: true }],
        },
        css_ordering_capabilities: {
          authenticated: true,
          company_context: true,
          company_id: 9999,
          company_active: true,
        },
      }),
    },
    "@/lib/magento/cart": {
      getCustomerCartSummary: async () => ({ total_quantity: 0, itemsV2: { items: [] } }),
      cartHasItems: () => false,
    },
  });

  await assert.rejects(
    () => customer.verifyPunchOutCustomerToken(config(), "token", { requireEmptyCart: true }),
    /does not match/,
  );
});

test("PunchOut assertion is RS256 and bound to the configured principal", () => {
  const fluid = load(root, "lib/punchout/fluid-session.ts", {
    "node:crypto": crypto,
    "@/lib/magento/client": { magentoGraphQL: async () => ({}) },
    "@/lib/magento/context": { getCustomerContext: async () => ({}), selectCompany: async () => ({}) },
  });
  const assertion = fluid.createPunchOutCustomerAssertion(config(), now, "synthetic_jti_1234567890");
  const [headerPart, payloadPart, signaturePart] = assertion.split(".");
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  assert.equal(header.alg, "RS256");
  assert.equal(payload.sub, "42");
  assert.equal(payload.company_id, 5437);
  assert.equal(payload.store_code, "default");
  assert.equal(payload.purpose, "punchout_customer_session");
  assert.equal(
    crypto.verify(
      "RSA-SHA256",
      Buffer.from(headerPart + "." + payloadPart),
      publicKey,
      Buffer.from(signaturePart, "base64url"),
    ),
    true,
  );
});

test("Fluid exchange verifies and selects the exact configured company", async () => {
  let reads = 0;
  const calls = [];
  const fluid = load(root, "lib/punchout/fluid-session.ts", {
    "node:crypto": crypto,
    "@/lib/magento/client": {
      magentoGraphQL: async (query, variables) => {
        calls.push({ query, variables });
        return { css_punchout_customer_session: "customer-token" };
      },
    },
    "@/lib/magento/context": {
      getCustomerContext: async () => {
        reads += 1;
        return {
          customer: { firstname: "Test", lastname: "Buyer", email: "buyer@example.test" },
          css_company_context: {
            authenticated: true,
            customer_id: 42,
            selected_company_id: reads === 1 ? null : 5437,
            companies: [{ company_id: 5437, company_user_id: 19, name: "Test", reference: null, active: true, selected: reads > 1 }],
          },
          css_ordering_capabilities: {
            authenticated: true, company_context: true, company_id: 5437, company_user_id: 19, company_active: true,
          },
          css_storefront_policy: { authenticated: true, hide_price: false, hide_add_to_cart: false, add_to_cart_label: null },
        };
      },
      selectCompany: async (_token, companyId) => ({
        cssSelectCompany: {
          authenticated: true,
          customer_id: 42,
          selected_company_id: companyId,
          companies: [{ company_id: companyId, company_user_id: 19, name: "Test", reference: null, active: true, selected: true }],
        },
      }),
    },
  });
  const token = await fluid.exchangePunchOutCustomerSession(config());
  assert.equal(token, "customer-token");
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /css_punchout_customer_session/);
  assert.equal(reads, 2);
});

class MockNextResponse {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers || {});
  }
}

test("disabled setup route is not exposed", async () => {
  const route = load(root, "app/api/punchout/cxml/route.ts", {
    "node:crypto": crypto,
    "next/server": { NextResponse: MockNextResponse },
    "@/lib/punchout/cxml": cxml,
    "@/lib/punchout/config": { getPunchOutConfig: () => ({ enabled: false }) },
    "@/lib/punchout/http": http,
    "@/lib/punchout/security": security,
    "@/lib/punchout/session": {
      PunchOutReplayError: class extends Error {},
      PunchOutSessionError: class extends Error {},
      PunchOutSessionStore: class { constructor() { throw new Error("disabled route must not open storage"); } },
    },
  });
  const response = await route.POST({
    headers: new Headers({ "content-type": "text/xml" }),
    text: async () => fixture,
  });
  assert.equal(response.status, 404);
});

test("development setup route returns a fixed-origin one-use StartPage", async () => {
  const sessionModule = load(root, "lib/punchout/session.ts", {
    "node:crypto": crypto,
    "node:sqlite": { DatabaseSync },
  });
  const route = load(root, "app/api/punchout/cxml/route.ts", {
    "node:crypto": crypto,
    "next/server": { NextResponse: MockNextResponse },
    "@/lib/punchout/cxml": cxml,
    "@/lib/punchout/config": {
      getPunchOutConfig: () => ({
        ...config({
          authMode: "preauthenticated",
          assertion: null,
          sessionDbPath: ":memory:",
          storeOrigin: "http://localhost:3000",
        }),
      }),
    },
    "@/lib/punchout/http": http,
    "@/lib/punchout/security": security,
    "@/lib/punchout/session": sessionModule,
  });
  const freshFixture = fixture.replace(
    'timestamp="2026-10-06T16:30:00Z"',
    'timestamp="' + new Date().toISOString() + '"',
  );
  const response = await route.POST({
    headers: new Headers({ "content-type": "text/xml" }),
    body: null,
    text: async () => freshFixture,
  });
  assert.equal(response.status, 200);
  assert.match(response.body, /<PunchOutSetupResponse>/);
  assert.match(response.body, /http:\/\/localhost:3000\/punchout\/session\/[A-Za-z0-9_-]{43}/);
});

test("preauthenticated StartPage does not consume its token before a login exists", async () => {
  let storeConstructed = false;
  const route = load(root, "app/punchout/session/[token]/route.ts", {
    "next/server": { NextResponse: MockNextResponse },
    "@/lib/session": {
      getCustomerToken: async () => null,
      setCustomerToken: async () => { throw new Error("must not set customer token"); },
    },
    "@/lib/punchout/browser-session": {
      setPunchOutBrowserToken: async () => { throw new Error("must not bind PunchOut cookie"); },
    },
    "@/lib/punchout/config": {
      getPunchOutConfig: () => config({ authMode: "preauthenticated", assertion: null }),
    },
    "@/lib/punchout/customer-session": {
      verifyPunchOutCustomerToken: async () => { throw new Error("must not verify without login"); },
    },
    "@/lib/punchout/fluid-session": {
      exchangePunchOutCustomerSession: async () => { throw new Error("must not call Fluid"); },
    },
    "@/lib/punchout/session": {
      PunchOutSessionStore: class {
        constructor() { storeConstructed = true; }
      },
    },
  });
  const response = await route.GET({}, {
    params: Promise.resolve({ token: "a".repeat(43) }),
  });
  assert.equal(response.status, 401);
  assert.equal(storeConstructed, false);
});

test("preauthenticated StartPage binds PunchOut only after exact customer verification", async () => {
  let verified = 0;
  let bound = null;
  const route = load(root, "app/punchout/session/[token]/route.ts", {
    "next/server": { NextResponse: MockNextResponse },
    "@/lib/session": {
      getCustomerToken: async () => "existing-customer-token",
      setCustomerToken: async () => { throw new Error("preauthenticated mode must not replace customer token"); },
    },
    "@/lib/punchout/browser-session": {
      setPunchOutBrowserToken: async (token, maxAge) => { bound = { token, maxAge }; },
    },
    "@/lib/punchout/config": {
      getPunchOutConfig: () => config({ authMode: "preauthenticated", assertion: null }),
    },
    "@/lib/punchout/customer-session": {
      verifyPunchOutCustomerToken: async (_config, token, options) => {
        assert.equal(token, "existing-customer-token");
        assert.equal(options.requireEmptyCart, true);
        verified += 1;
      },
    },
    "@/lib/punchout/fluid-session": {
      exchangePunchOutCustomerSession: async () => { throw new Error("must not call Fluid"); },
    },
    "@/lib/punchout/session": {
      PunchOutSessionStore: class {
        consumeEntryToken(token) {
          assert.equal(token, "b".repeat(43));
          return {
            browserToken: "c".repeat(43),
            session: {
              customerId: 42,
              companyId: 5437,
              storeCode: "default",
              expiresAt: Date.now() + 600000,
            },
          };
        }
        close() {}
      },
    },
  });
  const response = await route.GET({}, {
    params: Promise.resolve({ token: "b".repeat(43) }),
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/catalogue");
  assert.equal(verified, 1);
  assert.equal(bound.token, "c".repeat(43));
  assert.ok(bound.maxAge > 0);
});

class Navigation extends Error {
  constructor(location) { super(location); this.location = location; }
}

test("PunchOut browser session cannot fall through to native or credit order submission", async () => {
  const orderCalls = [];
  const actions = load(root, "app/checkout/payment/actions.ts", {
    "next/navigation": {
      redirect: (location) => { throw new Navigation(location); },
      unstable_rethrow: (error) => { if (error instanceof Navigation) throw error; },
    },
    "@/lib/session": { requireCustomerToken: async () => "token" },
    "@/lib/punchout/browser-session": {
      assertNormalCheckoutSession: async () => { throw new Error("Return this PunchOut basket to SAP."); },
    },
    "@/lib/magento/checkout": {
      getCheckoutContext: async () => { throw new Error("checkout read must not run"); },
      setBillingSameAsShipping: async () => {},
      setCheckoutPaymentMethod: async () => {},
      placeCheckoutOrder: async () => { orderCalls.push("native"); },
      submitCreditOrder: async () => { orderCalls.push("credit"); },
    },
    "@/lib/magento/employee": { getEmployeeOrdering: async () => ({ usesEmployee: false, multiEmployeeBasket: false, employees: [] }) },
  });
  const data = new FormData();
  data.set("payment_method", "checkmo");
  try { await actions.completeCheckoutAction(data); assert.fail("expected navigation"); }
  catch (error) {
    assert.ok(error instanceof Navigation, String(error));
    assert.equal(new URL(error.location, "https://store.test").pathname, "/checkout/payment");
  }
  assert.deepEqual(orderCalls, []);
});
