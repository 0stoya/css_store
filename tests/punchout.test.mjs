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

test("durable session store enforces payload replay, one-use entry and one return", () => {
  const sessionModule = load(root, "lib/punchout/session.ts", {
    "node:crypto": crypto,
    "node:sqlite": { DatabaseSync },
  });
  const store = new sessionModule.PunchOutSessionStore(":memory:");
  const setup = security.validatePunchOutSetup(cxml.parsePunchOutSetupRequest(fixture), config(), now);
  const created = store.create(setup, config(), now);
  assert.match(created.entryToken, /^[A-Za-z0-9_-]{43}$/);
  assert.throws(() => store.create(setup, config(), now), /payloadID/);

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
  store.close();
});

test("effective SAP SupplierPartID is the configured variant SKU when present", () => {
  const order = load(root, "lib/punchout/order-message.ts");
  assert.equal(order.effectivePunchOutSku({ product: { sku: "PARENT" }, configured_variant: { sku: "CHILD" } }), "CHILD");
  assert.equal(order.effectivePunchOutSku({ product: { sku: "SIMPLE" }, configured_variant: null }), "SIMPLE");
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
