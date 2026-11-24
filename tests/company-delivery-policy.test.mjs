import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import load from "./helpers/load-typescript.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const defaults = load(root, "lib/checkout-defaults.ts");
const a = { id: 1, firstname: "Buyer", lastname: "One", company: "Company", street: ["One Road"], city: "Town",
  postcode: "AB1 2CD", telephone: "0123456789", country_code: "GB", region: { region: "Norfolk", region_code: null }, default_shipping: true };
const b = { ...a, id: 2, street: ["Other Road"], default_shipping: false };
const money = { value: 7.5, currency: "GBP" };
const rate = { carrier_code: "native", method_code: "delivery", amount: money, available: true };
const quote = (saved = a, street = saved.street) => ({
  firstname: saved.firstname, lastname: saved.lastname, company: saved.company, street,
  city: saved.city, postcode: saved.postcode, telephone: saved.telephone, country: { code: saved.country_code },
  region: { label: saved.region?.region ?? null, code: saved.region?.region_code ?? null },
  selected_shipping_method: rate, available_shipping_methods: [rate],
});
function delivery({ addresses = [a,b], shipping = quote(), company = 3, customer = 8, memberships, allowed = true } = {}) {
  return {
    css_company_context: { selected_company_id: company, customer_id: customer,
      companies: memberships ?? [{ company_id: company, selected: true }, { company_id: 4, selected: false }] },
    css_ordering_capabilities: { authenticated: true, company_context: true, company_active: true, can_checkout: allowed },
    customer: { addresses }, customerCart: { id: "cart", total_quantity: 1, shipping_addresses: shipping ? [shipping] : [],
      prices: { subtotal_excluding_tax: { value: 20, currency: "GBP" }, grand_total: { value: 27.5, currency: "GBP" } } },
  };
}
function fixture({ context = delivery(), modes = [[3, "APPROVED_ONLY"]], dbError = false, controlled = false, changedTotal = false, loseRate = false } = {}) {
  const calls = [];
  const lib = load(root, "lib/company-delivery-policy.ts", {
    "@/lib/employee-delivery-address": { getCompanyDeliveryModes: async (ids) => {
      calls.push(["read", Array.from(ids)]);
      if (dbError) throw new Error("secret database error");
      return new Map(modes);
    }},
    "@/lib/checkout-defaults": defaults,
    "@/lib/controlled-employee-delivery": {
      controlledDeliveryApplies: async () => controlled,
      assignedOwnedAddress: async () => a,
      selectedCartEmployeeId: () => 7,
      confirmedCartRecipient: (saved, actual) => actual?.street[0] === "Attn: Jane" && saved.id === 1 ? "Jane" : null,
      cartOnlyRecipientAddress: (saved, recipient) => ({ ...saved, street: ["Attn: " + recipient, ...saved.street], save_in_address_book: false }),
    },
    "@/lib/magento/shipping": {
      getDeliveryContext: async () => context,
      setSavedShippingAddress: async (_token, _cart, id) => {
        calls.push(["saved", id]); context.customerCart.shipping_addresses = [quote(context.customer.addresses.find((item) => item.id === id))];
        if (loseRate) context.customerCart.shipping_addresses[0].selected_shipping_method = null;
        if (changedTotal) context.customerCart.prices.grand_total = { value: 30, currency: "GBP" };
      },
      setNewShippingAddress: async (_token, _cart, address) => { calls.push(["cart-only", address.save_in_address_book]); },
      setShippingMethod: async () => { calls.push(["rate"]); context.customerCart.shipping_addresses[0].selected_shipping_method = rate; },
    },
  });
  return { lib, calls, context };
}

test("saved mode uses only live owned addresses, default-only requires exactly one true default", async () => {
  const f = fixture();
  const p = await f.lib.readCompanyDeliveryPolicy(f.context);
  assert.deepEqual(f.calls[0], ["read", [3,4]]);
  assert.equal(p.mode, "APPROVED_ONLY");
  assert.deepEqual(Array.from(f.lib.companyPermittedAddresses(f.context, p), (item) => item.id), [1,2]);
  assert.throws(() => f.lib.assertCompanySavedAddress(f.context, p, 99), /not permitted/);
  const d = { ...p, mode: "DEFAULT_ONLY" };
  assert.equal(f.lib.companyDefaultAddress(f.context, d).id, 1);
  assert.throws(() => f.lib.assertCompanySavedAddress(f.context, d, 2), /not permitted/);
  for (const addresses of [[b], [{ ...a, default_shipping: true }, { ...b, default_shipping: true }], [], [{ ...a, telephone: "" }]]) {
    const c = delivery({ addresses });
    assert.equal(f.lib.companyDefaultAddress(c, d), null);
  }
});

test("company scope and DB failures fail closed; only absent rows mean unrestricted", async () => {
  const f = fixture({ modes: [] });
  const policy = await f.lib.readCompanyDeliveryPolicy(f.context);
  assert.equal(policy.mode, "UNRESTRICTED"); assert.equal(policy.addressBookLocked, false);
  for (const options of [{ dbError: true }, { context: delivery({ allowed: false }) },
    { context: delivery({ memberships: [{ company_id: 4, selected: true }] }) },
    { context: delivery({ memberships: [{ company_id: 3, selected: true }, { company_id: 3, selected: false }] }) }]) {
    const rejected = fixture(options);
    await assert.rejects(rejected.lib.readCompanyDeliveryPolicy(rejected.context), /delivery settings/);
  }
});

test("address-book write is forbidden for any restricted membership, even while shopping in unrestricted company", async () => {
  const f = fixture({ modes: [[4, "DEFAULT_ONLY"]] });
  const p = await f.lib.readCompanyDeliveryPolicy(f.context);
  assert.equal(p.mode, "UNRESTRICTED"); assert.equal(p.addressBookLocked, true);
  assert.doesNotThrow(() => f.lib.assertCompanyNewAddress(p, false));
  assert.throws(() => f.lib.assertCompanyNewAddress(p, true), /saved addresses/);
  assert.throws(() => f.lib.assertCompanyNewAddress({ ...p, mode: "APPROVED_ONLY" }, false), /only permits/);
});

test("the actual destination must match current native saved content, including region and contact", async () => {
  const f = fixture(); const p = await f.lib.readCompanyDeliveryPolicy(f.context);
  assert.equal(f.lib.companyDestinationReady(f.context, p, false, null), true);
  for (const change of [{ street: ["Wrong Road"] }, { postcode: "AB2 3CD" }, { company: "Other" }, { telephone: "999" }, { region: { label: "Other", code: null } }]) {
    const c = delivery({ shipping: { ...quote(), ...change } });
    assert.equal(f.lib.companyDestinationReady(c, p, false, null), false);
    await assert.rejects(f.lib.assertCompanyCartDestination(c, p), /permitted/);
  }
  const changed = delivery({ addresses: [b] });
  await assert.rejects(f.lib.assertCompanyCartDestination(changed, p), /permitted/);
});

test("Employee Attn exception is only for the verified assigned, policy-permitted destination", async () => {
  const c = delivery({ shipping: quote(a, ["Attn: Jane", ...a.street]) });
  const f = fixture({ context: c, controlled: true }); const p = await f.lib.readCompanyDeliveryPolicy(c);
  assert.equal(f.lib.companyDestinationReady(c, p, true, a), true);
  assert.equal(f.lib.companyDestinationReady(c, p, false, null), false);
  await f.lib.assertCompanyCartDestination(c, p);
  const conflict = fixture({ context: delivery({ addresses: [{ ...a, default_shipping: false }, { ...b, default_shipping: true }], shipping: quote(a, ["Attn: Jane", ...a.street]) }), modes: [[3,"DEFAULT_ONLY"]], controlled: true });
  const cp = await conflict.lib.readCompanyDeliveryPolicy(conflict.context);
  await assert.rejects(conflict.lib.assertCompanyCartDestination(conflict.context, cp), /conflicts/);
});

test("submit preparation reapplies native saved address and exact rate, then verifies quote and totals", async () => {
  const f = fixture({ loseRate: true });
  const snapshot = JSON.parse(JSON.stringify(f.context));
  assert.equal(await f.lib.checkCompanyDeliveryAtPayment("token", snapshot, "normalise"), true);
  assert.ok(f.calls.some((call) => call[0] === "saved" && call[1] === 1));
  assert.ok(f.calls.some((call) => call[0] === "rate"));
  assert.equal(await f.lib.checkCompanyDeliveryAtPayment("token", snapshot, "final", true), true);
  const changed = fixture({ changedTotal: true });
  await assert.rejects(changed.lib.checkCompanyDeliveryAtPayment("token", JSON.parse(JSON.stringify(changed.context)), "normalise"), /totals changed/);
});

test("existing one-off quote under another company is reapplied with save_in_address_book false", async () => {
  const f = fixture({ modes: [[4, "DEFAULT_ONLY"]], context: delivery({ shipping: { ...quote(), street: ["One-off location"] } }) });
  const snapshot = JSON.parse(JSON.stringify(f.context));
  await f.lib.checkCompanyDeliveryAtPayment("token", snapshot, "normalise");
  assert.ok(f.calls.some((call) => call[0] === "cart-only" && call[1] === false));
});

test("final guards reject unapproved or stale scope and policy changed before submit", async () => {
  const f = fixture();
  await assert.rejects(f.lib.checkCompanyDeliveryAtPayment("token", f.context, "final", false), /policy changed/);
  const stale = { ...f.context, css_company_context: { ...f.context.css_company_context, selected_company_id: 99 } };
  await assert.rejects(f.lib.checkCompanyDeliveryAtPayment("token", stale, "review"), /company changed/);
  const bad = fixture({ context: delivery({ shipping: { ...quote(), street: ["Bad Road"] } }) });
  await assert.rejects(bad.lib.checkCompanyDeliveryAtPayment("token", bad.context, "normalise"), /permitted/);
  assert.ok(!bad.calls.some((call) => call[0] === "saved" || call[0] === "cart-only"));
});

test("every known Store checkout address write and both final submission routes have enforcement", () => {
  const src = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const actions = src("app/checkout/delivery/actions.ts");
  const employee = src("app/checkout/employee/actions.ts");
  const auto = src("app/checkout/delivery/defaults.ts");
  const payment = src("app/checkout/payment/actions.ts");
  const page = src("app/checkout/delivery/page.tsx");
  assert.match(actions, /assertCompanySavedAddress[\s\S]*?setSavedShippingAddress\(token, cart.id, addressId\)/);
  assert.match(actions, /assertCompanyNewAddress\(await readCompanyDeliveryPolicy\(context\), saveInAddressBook\)/);
  assert.match(employee, /assertCompanySavedAddress\(delivery, companyPolicy, ownedId\)/);
  assert.match(auto, /companyDefaultAddress\(context, policy\)/);
  assert.match(payment, /checkCompanyDeliveryAtPayment\(token, initial, "normalise"\)/);
  assert.match(payment, /checkCompanyDeliveryAtPayment\(token, current, "final", normalisedBook\)[\s\S]*?submitCreditOrder\(token, cart.id\)[\s\S]*?placeCheckoutOrder\(token, cart.id\)/);
  assert.match(page, /allowedAddresses.map/);
  assert.match(page, /companyPolicy\?\.mode === "UNRESTRICTED" \? <details/);
  assert.match(page, /!companyPolicy.addressBookLocked \? <label/);
});
