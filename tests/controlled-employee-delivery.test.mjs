import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (p) => readFileSync(path.join(root, p), "utf8");
const SAVED = {
  id: 1132,
  firstname: "HSEQ",
  lastname: "Team",
  company: "Currie & Brown",
  street: ["64-66 Upper Church Lane"],
  city: "Belfast",
  region: { region: "Antrim", region_code: null },
  postcode: "BT1 4QL",
  country_code: "GB",
  telephone: "02070619000",
  default_shipping: false,
};
const cartShipping = (street) => ({
  firstname: SAVED.firstname, lastname: SAVED.lastname,
  company: SAVED.company, street,
  city: SAVED.city, postcode: SAVED.postcode,
  telephone: SAVED.telephone, country: { code: "GB", label: "United Kingdom" },
  region: null, available_shipping_methods: [], selected_shipping_method: null,
});
function delivery({ company = 5323, customer = 99, employees = [1008], mode = true, multi = false, addresses = [SAVED], shipping = [] } = {}) {
  return {
    css_company_context: { selected_company_id: company, customer_id: customer },
    css_company_employee_configuration: { uses_employee: mode, multi_employee_basket: multi },
    customer: { addresses },
    customerCart: {
      id: "cart-1",
      itemsV2: { items: employees.map((id) => ({ css_employee: id === null ? null : { employee_id: id }, css_kit: null })) },
      shipping_addresses: shipping,
    },
  };
}
function fixture({ policy = true, mappedId = SAVED.id, readError = false, current = delivery() } = {}) {
  const calls = [];
  const helpers = loadTypeScript(root, "lib/controlled-employee-delivery.ts", {
    "@/lib/employee-delivery-address": {
      getControlledEmployeeDeliveryEnabled: async (companyId) => {
        calls.push(["policy", companyId]);
        if (readError) throw new Error("policy DB unavailable");
        return policy;
      },
      getAssignedEmployeeDeliveryAddress: async (...args) => {
        calls.push(["address", ...args]);
        return mappedId;
      },
    },
    "@/lib/magento/shipping": {
      getDeliveryContext: async () => current,
    },
  });
  return { helpers, calls };
}

test("company flag is ignored unless canonical single-Employee ordering is enabled", async () => {
  for (const config of [{ mode: false }, { multi: true }]) {
    const { helpers, calls } = fixture({ current: delivery(config) });
    assert.equal(await helpers.controlledDeliveryApplies(delivery(config)), false);
    assert.equal(calls.length, 0);
  }
  const disabled = fixture({ policy: false });
  assert.equal(await disabled.helpers.controlledDeliveryApplies(delivery()), false);
  assert.deepEqual(Array.from(disabled.calls[0]), ["policy", 5323]);
});

test("enabled company fails closed when its restricted policy read is unavailable", async () => {
  const { helpers } = fixture({ readError: true });
  await assert.rejects(helpers.controlledDeliveryApplies(delivery()), /delivery settings are temporarily unavailable/);
});

test("cart assignment verifies all lines belong to the same Employee", () => {
  const { helpers } = fixture();
  assert.equal(helpers.selectedCartEmployeeId(delivery({ employees: [1008, 1008] })), 1008);
  assert.equal(helpers.selectedCartEmployeeId(delivery({ employees: [1008, 1009] })), null);
  assert.equal(helpers.selectedCartEmployeeId(delivery({ employees: [null] })), null);
  assert.equal(helpers.selectedCartEmployeeId(delivery({ employees: [] })), null);
});

test("resolved address ID is scoped to the authenticated Magento customer and company", async () => {
  const f = fixture();
  const found = await f.helpers.assignedOwnedAddress(delivery({ company: 5323, customer: 99 }), 1008);
  assert.equal(found.id, 1132);
  assert.deepEqual(Array.from(f.calls[0]), ["address", 5323, 99, 1008]);
  const otherOwner = fixture({ current: delivery({ addresses: [] }) });
  assert.equal(await otherOwner.helpers.assignedOwnedAddress(delivery({ addresses: [] }), 1008), null);
  const notMapped = fixture({ mappedId: null });
  assert.equal(await notMapped.helpers.assignedOwnedAddress(delivery(), 1008), null);
});

test("cart-only recipient is street line one; saved Magento street remains unchanged", () => {
  const { helpers } = fixture();
  const address = helpers.cartOnlyRecipientAddress(SAVED, "  John   Smith ");
  assert.deepEqual(Array.from(address.street), ["Attn: John Smith", "64-66 Upper Church Lane"]);
  assert.deepEqual(SAVED.street, ["64-66 Upper Church Lane"]);
  assert.equal(address.save_in_address_book, false);
  assert.equal(address.postcode, "BT1 4QL");
  assert.equal(address.telephone, "02070619000");
  assert.equal(helpers.confirmedCartRecipient(SAVED, cartShipping(address.street)), "John Smith");
  assert.equal(helpers.confirmedCartRecipient(SAVED, cartShipping(["64-66 Upper Church Lane"])), null);
  assert.equal(helpers.confirmedCartRecipient(SAVED, cartShipping(["Attn: John Smith", "150 Holborn"])), null);
  assert.equal(helpers.confirmedCartRecipient(SAVED, { ...cartShipping(address.street), postcode: "EC1N 2NS" }), null);
});

test("recipient name must be supplied, on one line, without duplicate attention prefix", () => {
  const { helpers } = fixture();
  for (const value of ["", "a", "A".repeat(81), "Attn: John", "Joe\nAdmin", "Joe<Smith>"]) {
    assert.throws(() => helpers.recipientName(value));
  }
  assert.equal(helpers.recipientName("  Jan   Kowalski  "), "Jan Kowalski");
});

test("checkout guard rechecks current Employee, mapping, owner and cart recipient", async () => {
  const readyDelivery = delivery({ shipping: [cartShipping(["Attn: John Smith", ...SAVED.street])] });
  const pass = fixture({ current: readyDelivery });
  const status = await pass.helpers.assertControlledCartReady("token", "cart-1");
  assert.equal(status.controlled, true);
  assert.equal(status.employeeId, 1008);
  assert.equal(status.addressId, 1132);
  const changedEmployee = fixture({ current: delivery({ employees: [1009], shipping: readyDelivery.customerCart.shipping_addresses }), mappedId: null });
  await assert.rejects(changedEmployee.helpers.assertControlledCartReady("token", "cart-1"), /no assigned delivery address/);
  const missingName = fixture({ current: delivery({ shipping: [cartShipping(SAVED.street)] }) });
  await assert.rejects(missingName.helpers.assertControlledCartReady("token", "cart-1"), /recipient/);
  const disabled = fixture({ current: readyDelivery, policy: false });
  assert.equal((await disabled.helpers.assertControlledCartReady("token", "cart-1")).controlled, false);
});

test("controlled mode hides Magento address list and blocks all unapproved writes", () => {
  const page = source("app/checkout/delivery/page.tsx");
  const actions = source("app/checkout/delivery/actions.ts");
  const payment = source("app/checkout/payment/actions.ts");
  const graphql = source("lib/magento/shipping.ts");
  const billing = source("lib/magento/checkout.ts");
  const store = source("lib/employee-delivery-address.ts");
  assert.match(page, /controlled \? \([\s\S]*?Assigned Employee delivery[\s\S]*?: \([\s\S]*?delivery\.customer\.addresses\.map/);
  assert.match(page, /confirmControlledEmployeeDeliveryAction/);
  assert.match(page, /controlledReady && !deliveryReviewPending/);
  assert.match(actions, /export async function confirmControlledEmployeeDeliveryAction/);
  assert.match(actions, /assertControlledCartReady\(token, cart\.id\)/);
  assert.match(actions, /if \(await controlledDeliveryApplies\(context\)\)/);
  assert.match(actions, /cartOnlyRecipientAddress\(address, recipient\)/);
  assert.match(payment, /assertControlledCartReady\(token, cart\.id\)/);
  assert.match(payment, /assertControlledCartReady\(token, initialCart\.id\)/);
  assert.match(payment, /setBillingSavedAddress\(token, initialCart\.id, initialPolicy\.addressId\)/);
  assert.match(billing, /billing_address: \{ customer_address_id: \$customerAddressId \}/);
  assert.match(store, /FROM css_admin\.company_employee_delivery_policy/);
  assert.doesNotMatch(store, /\bINSERT INTO\b|\bUPDATE\s+css_admin\.|\bDELETE FROM\b/);
  assert.match(graphql, /save_in_address_book: boolean/);
});

class Navigation extends Error {
  constructor(url) { super(url); this.url = url; }
}

function checkoutActionFixture() {
  const calls = [];
  const fixtureDelivery = {
    ...delivery({ shipping: [cartShipping(SAVED.street)] }),
    customerCart: { ...delivery().customerCart, total_quantity: 2 },
    css_ordering_capabilities: {
      authenticated: true, company_context: true,
      company_active: true, can_checkout: true,
    },
  };
  const actions = loadTypeScript(root, "app/checkout/delivery/actions.ts", {
    "@/lib/punchout/guard": { assertNormalCheckoutSession: async () => {} },
    "next/navigation": {
      redirect: (url) => { throw new Navigation(url); },
      unstable_rethrow: (error) => { if (error instanceof Navigation) throw error; },
    },
    "@/lib/magento/shipping": {
      getDeliveryContext: async () => fixtureDelivery,
      setSavedShippingAddress: async () => { calls.push("unrestricted-saved-write"); },
      setNewShippingAddress: async (_token, _cart, address) => {
        calls.push(["cart-only", address]);
      },
      setShippingMethod: async () => { calls.push("method"); },
    },
    "@/lib/session": { requireCustomerToken: async () => "customer-token" },
    "@/lib/magento/employee": {
      getEmployeeOrdering: async () => ({
        usesEmployee: true, multiEmployeeBasket: false,
        employees: [{ employee_id: 1008 }],
      }),
    },
    "@/lib/controlled-employee-delivery": {
      controlledDeliveryApplies: async () => true,
      selectedCartEmployeeId: () => 1008,
      assignedOwnedAddress: async () => SAVED,
      cartOnlyRecipientAddress: (address, name) => ({
        firstname: address.firstname,
        lastname: address.lastname,
        street: ["Attn: " + name, ...address.street],
        city: address.city, postcode: address.postcode,
        country_code: address.country_code,
        telephone: address.telephone,
        save_in_address_book: false,
      }),
      assertControlledCartReady: async () => ({
        controlled: true, addressId: SAVED.id,
      }),
    },
    "@/lib/employee-delivery-review": {
      clearEmployeeDeliveryReview: async () => { calls.push("clear"); },
    },
  });
  return { actions, calls };
}

test("direct posted manual saved/new address forms cannot bypass controlled policy", async () => {
  const f = checkoutActionFixture();
  const postedSaved = new FormData();
  postedSaved.set("customer_address_id", String(SAVED.id));
  await assert.rejects(
    f.actions.selectSavedShippingAddressAction(postedSaved),
    (e) => e instanceof Navigation && e.url.includes("/checkout/delivery?error="),
  );
  const postedCustom = new FormData();
  postedCustom.set("street_1", "Unauthorised alternate delivery");
  await assert.rejects(
    f.actions.setNewShippingAddressAction(postedCustom),
    (e) => e instanceof Navigation && e.url.includes("/checkout/delivery?error="),
  );
  assert.deepEqual(f.calls, []);
});

test("recipient form creates exactly one cart-only address and clears review only after verification", async () => {
  const f = checkoutActionFixture();
  const data = new FormData();
  data.set("recipient_name", "John Smith");
  data.set("street_1", "Ignored browser-supplied destination");
  await assert.rejects(
    f.actions.confirmControlledEmployeeDeliveryAction(data),
    (e) => e instanceof Navigation && e.url.includes("/checkout/delivery?notice="),
  );
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0][0], "cart-only");
  assert.deepEqual(Array.from(f.calls[0][1].street), ["Attn: John Smith", ...SAVED.street]);
  assert.equal(f.calls[0][1].save_in_address_book, false);
  assert.equal(f.calls[1], "clear");
});
