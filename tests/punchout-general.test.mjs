import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { SaxesParser } from "saxes";
import { fileURLToPath } from "node:url";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const now = Date.parse("2026-10-27T14:30:00Z");
const configModule = load(root, "lib/punchout/config.ts", {"node:path": path});
const cxml = load(root, "lib/punchout/cxml.ts", {"saxes": {SaxesParser}});
const security = load(root, "lib/punchout/security.ts", {"node:crypto": crypto});
const session = load(root, "lib/punchout/session.ts", {"node:crypto": crypto, "node:sqlite": {DatabaseSync}});
const message = load(root, "lib/punchout/order-message.ts");

function partner(id, from, companyId, customerIds) {
  return {
    id,
    credentials: {
      from: {domain: "NetworkID", identity: from},
      to: {domain: "NetworkID", identity: "CSS"},
      sender: {domain: "NetworkID", identity: "sender-" + id},
    },
    sharedSecret: "test-secret-" + id,
    companyId, customerIds, storeCode: "default",
    allowedReturnHosts: [id + ".buyer.test"],
    defaultUom: "EA", priceTaxBasis: "EX_VAT",
    deploymentMode: "test", browserFormField: "cXML-urlencoded",
    requireUnspsc: true,
    lineMetadata: {"SKU-A": {uom: "EA", unspsc: "46181504"}},
  };
}
function environment(profiles = [
  partner("alpha", "buyer-A", 50, [101, 102]),
  partner("beta", "buyer-B", 60, [201]),
]) {
  return {
    NODE_ENV: "development",
    MAGENTO_STORE_CODE: "default",
    PUNCHOUT_ENABLED: "1",
    PUNCHOUT_AUTH_MODE: "preauthenticated",
    PUNCHOUT_RESERVED_CUSTOMER_IDS: "101,102,201",
    PUNCHOUT_PROFILES_JSON: JSON.stringify(profiles),
    PUNCHOUT_SESSION_DB_PATH: "/tmp/css-punchout-test-database",
    PUNCHOUT_STORE_ORIGIN: "https://store.example.test",
    PUNCHOUT_MAX_CLOCK_SKEW_SECONDS: "300",
    PUNCHOUT_SESSION_TTL_SECONDS: "1800",
  };
}
const config = configModule.getPunchOutConfig(environment());
function xmlRequest(profile, payloadID = "payload-1", options = {}) {
  const timestamp = options.timestamp || new Date(now).toISOString();
  const callback = options.callback || "https://" + profile.id + ".buyer.test/return";
  const secret = options.secret || profile.sharedSecret;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE cXML SYSTEM "https://xml.cxml.org/schemas/cXML/1.2.067/cXML.dtd">',
    '<cXML payloadID="' + payloadID + '" timestamp="' + timestamp + '" version="1.2.067">',
    "<Header><From><Credential domain=\"NetworkID\"><Identity>" + profile.credentials.from.identity + "</Identity></Credential></From>",
    "<To><Credential domain=\"NetworkID\"><Identity>CSS</Identity></Credential></To>",
    "<Sender><Credential domain=\"NetworkID\"><Identity>" + profile.credentials.sender.identity +
      "</Identity><SharedSecret>" + secret + "</SharedSecret></Credential><UserAgent>test</UserAgent></Sender></Header>",
    '<Request><PunchOutSetupRequest operation="create"><BuyerCookie>buyer-cookie-' + profile.id + "</BuyerCookie>",
    "<BrowserFormPost><URL>" + callback.replaceAll("&", "&amp;") + "</URL></BrowserFormPost>",
    "</PunchOutSetupRequest></Request></cXML>",
  ].join("");
}
function setup(profile, id) {
  const request = cxml.parsePunchOutSetupRequest(xmlRequest(profile, id));
  return security.validatePunchOutSetup(request, config, now).setup;
}
test("generic profile registry matches two companies, validates reserved principals and forbids production preauth", () => {
  assert.equal(config.profiles.length, 2);
  assert.equal(config.profiles[0].customerIds.length, 2);
  assert.equal(config.profiles[1].companyId, 60);
  assert.deepEqual(Array.from(configModule.getReservedPunchOutCustomerIds(environment())), [101, 102, 201]);
  assert.throws(() => configModule.getPunchOutConfig({...environment(), NODE_ENV: "production"}), /forbidden/i);
  assert.throws(() => configModule.getPunchOutConfig(environment([
    partner("alpha", "buyer-A", 50, [101]),
    partner("beta", "buyer-B", 60, [101]),
  ])), /shared/i);
  assert.throws(() => configModule.getPunchOutConfig(environment([
    partner("alpha", "buyer-A", 50, [4444]),
  ])), /reserved/i);
});
test("strict cXML parsing and partner matching rejects wrong secrets and callback hosts", () => {
  const alpha = config.profiles[0], beta = config.profiles[1];
  const parsed = cxml.parsePunchOutSetupRequest(xmlRequest(alpha));
  const accepted = security.validatePunchOutSetup(parsed, config, now);
  assert.equal(accepted.profile.id, "alpha");
  assert.equal(accepted.setup.buyerCookie, "buyer-cookie-alpha");
  assert.equal(security.validatePunchOutSetup(cxml.parsePunchOutSetupRequest(xmlRequest(beta)), config, now).profile.id, "beta");
  assert.throws(() => security.validatePunchOutSetup(
    cxml.parsePunchOutSetupRequest(xmlRequest(alpha, "p2", {secret: "incorrect-secret"})), config, now,
  ), /unrecognised/i);
  assert.throws(() => security.validatePunchOutSetup(
    cxml.parsePunchOutSetupRequest(xmlRequest(alpha, "p2", {callback: "https://beta.buyer.test/return"})), config, now,
  ), /untrusted/i);
  assert.throws(() => security.validatePunchOutSetup(
    cxml.parsePunchOutSetupRequest(xmlRequest(alpha, "p3", {timestamp: "2026-10-26T14:30:00Z"})), config, now,
  ), /window/i);
  assert.throws(() => cxml.parsePunchOutSetupRequest(
    xmlRequest(alpha).replace(/<!DOCTYPE[^>]*>/, '<!DOCTYPE cXML [<!ENTITY x "boom">]>'),
  ), /DTD|entity/i);
});
test("partner-local payload replay and customer-pool leases survive a new SQLite handle", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "css-punchout-general-"));
  const filename = path.join(folder, "state.sqlite");
  const alpha = config.profiles[0], beta = config.profiles[1];
  const store = new session.PunchOutSessionStore(filename);
  try {
    const first = store.create(setup(alpha, "one"), alpha, config, now);
    assert.equal(first.customerId, 101);
    assert.equal(store.create(setup(alpha, "two"), alpha, config, now).customerId, 102);
    assert.throws(() => store.create(setup(alpha, "three"), alpha, config, now), /available/i);
    assert.equal(store.create(setup(beta, "one"), beta, config, now).customerId, 201);
    const anotherHandle = new session.PunchOutSessionStore(filename);
    try {
      assert.equal(anotherHandle.peekEntry(first.entryToken, now).profileId, "alpha");
      const entered = anotherHandle.consumeEntryToken(first.entryToken, now + 1);
      assert.equal(entered.session.customerId, 101);
      assert.equal(anotherHandle.getActiveByBrowserToken(entered.browserToken, now + 2).profileId, "alpha");
      assert.throws(() => anotherHandle.consumeEntryToken(first.entryToken, now + 3), /unavailable/i);
      anotherHandle.markReturned(entered.browserToken, now + 4);
      assert.equal(anotherHandle.getActiveByBrowserToken(entered.browserToken, now + 5), null);
      assert.throws(() => anotherHandle.markReturned(entered.browserToken, now + 6), /unavailable/i);
      assert.throws(() => anotherHandle.create(setup(alpha, "one"), alpha, config, now + 7), /replay/i);
      assert.equal(anotherHandle.create(setup(alpha, "three"), alpha, config, now + 8).customerId, 101);
    } finally { anotherHandle.close(); }
  } finally { store.close(); fs.rmSync(folder, {recursive: true, force: true}); }
});
function cart(items) {
  return {
    id: "cart-one", total_quantity: items.reduce((n, item) => n + item.quantity, 0),
    itemsV2: {items}, css_company_discount: {applied:false},
    css_purchase_eligibility: {approval_status:"ALLOWED"},
  };
}
function item({sku="SKU-A", variant=null, quantity=2, unit=5, row=10, currency="GBP"}={}) {
  return {
    quantity, product: {sku, name: "Safety Gloves"},
    configured_variant: variant ? {sku: variant, name: "Selected Gloves"} : null,
    prices: {price:{value:unit,currency},row_total:{value:row,currency}},
  };
}
test("cXML return emits authoritative line/variant SKU, purchaser cookie, UOM, UNSPSC and escaped XML", () => {
  const p = config.profiles[0], s = {
    payloadId: "original-setup", buyerCookie: "cookie<&>",
  };
  const two = {...p,
    defaultUom: "EA",
    lineMetadata: {...p.lineMetadata, "SKU-B": {uom:"PAIR", unspsc:"46181504", auxiliaryId:"AUX<&>"}},
  };
  const result = message.buildPunchOutOrderMessage({
    cart: cart([item(), item({sku:"parent",variant:"SKU-B",quantity:1,unit:7,row:7})]),
    session: s, profile: two, payloadId: "reply-1",
    timestamp: "2026-10-27T14:40:00Z",
  });
  assert.match(result, /<SupplierPartID>SKU-B<\/SupplierPartID>/);
  assert.match(result, /deploymentMode="test"/);
  assert.doesNotMatch(result, /<SupplierPartID>parent<\/SupplierPartID>/);
  assert.match(result, /<BuyerCookie>cookie&lt;&amp;&gt;<\/BuyerCookie>/);
  assert.match(result, /<SupplierPartAuxiliaryID>AUX&lt;&amp;&gt;<\/SupplierPartAuxiliaryID>/);
  assert.match(result, /<UnitOfMeasure>PAIR<\/UnitOfMeasure>/);
  assert.match(result, /<Money currency="GBP">17.00<\/Money>/);
  assert.match(result, /<Classification domain="UNSPSC">46181504<\/Classification>/);
});
test("cXML return fails closed on missing UOM/UNSPSC, pricing discrepancy, discount and blocked purchase", () => {
  const p = config.profiles[0], s = {payloadId:"setup",buyerCookie:"abc"};
  const serialize = (basket, profile=p) => message.buildPunchOutOrderMessage({
    cart:basket, profile, session:s, payloadId:"response",timestamp:"2026-10-27T14:40:00Z",
  });
  assert.throws(() => serialize(cart([item({unit:4,row:10})])), /reconcile/i);
  assert.throws(() => serialize(cart([item({sku:"UNKNOWN"})])), /UNSPSC/i);
  assert.throws(() => serialize(cart([item()]), {...p,defaultUom:undefined,lineMetadata:{"SKU-A":{unspsc:"46181504"}}}), /UnitOfMeasure/i);
  const discounted = cart([item()]);
  discounted.css_company_discount.applied = true;
  assert.throws(() => serialize(discounted), /discount/i);
  const notAllowed = cart([item()]);
  notAllowed.css_purchase_eligibility.approval_status="APPROVAL_REQUIRED";
  assert.throws(() => serialize(notAllowed), /eligible/i);
});
test("store checkout source keeps both irrevocable submit branches behind a server guard", () => {
  for (const name of [
    "app/checkout/payment/actions.ts", "app/checkout/delivery/actions.ts",
    "app/checkout/employee/actions.ts", "app/checkout/payment/page.tsx",
    "app/checkout/delivery/page.tsx",
  ]) {
    assert.match(fs.readFileSync(path.join(root, name), "utf8"), /assertNormalCheckoutSession/);
  }
  assert.match(fs.readFileSync(path.join(root, "lib/punchout/guard.ts"), "utf8"), /getReservedPunchOutCustomerIds/);
});
