import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const helpers = load(root, "lib/checkout-defaults.ts");
const address = { id: 12, default_shipping: false, firstname: "Buyer", lastname: "Example",
  street: ["1 Example Road"], city: "Example", postcode: "AB1 2CD", country_code: "GB" };
const rate = { carrier_code: "ogldelivery", method_code: "company", available: true, error_message: null };
const shipping = { ...address, country: { code: "GB" }, available_shipping_methods: [rate], selected_shipping_method: null };
const other = { ...rate, method_code: "other" };

test("explicit default wins, single saved address is fallback; ambiguous defaults never guessed", () => {
  assert.equal(helpers.defaultSavedAddress([address])?.id, 12);
  assert.equal(helpers.defaultSavedAddress([address, { id: 13, default_shipping: true }])?.id, 13);
  assert.equal(helpers.defaultSavedAddress([address, { id: 13, default_shipping: false }]), null);
  assert.equal(helpers.defaultSavedAddress([{ ...address, default_shipping: true }, { id: 13, default_shipping: true }]), null);
  assert.equal(helpers.defaultSavedAddress([]), null);
});

test("only one demonstrably available unselected shipping method is automatic", () => {
  assert.equal(helpers.soleUnselectedShippingMethod(shipping)?.method_code, "company");
  assert.equal(helpers.soleUnselectedShippingMethod({ ...shipping, selected_shipping_method: rate }), null);
  assert.equal(helpers.soleUnselectedShippingMethod({ ...shipping, available_shipping_methods: [rate, other] }), null);
  assert.equal(helpers.soleUnselectedShippingMethod({ ...shipping, available_shipping_methods: [{ ...rate, available: false }] }), null);
  assert.equal(helpers.soleUnselectedShippingMethod({ ...shipping, available_shipping_methods: [{ ...rate, available: null }] }), null);
  assert.equal(helpers.soleUnselectedShippingMethod({ ...shipping, available_shipping_methods: [] }), null);
});

class Navigation extends Error { constructor(url) { super(url); this.url = url; } }
function fixture({ addresses = [address], existing = null, company = 3, employee = false, pending = false, controlled = false, blocked = false, badRate = false, punchout = false } = {}) {
  const calls = [];
  const context = {
    css_company_context: { selected_company_id: company, customer_id: 2 },
    css_company_employee_configuration: { uses_employee: employee, multi_employee_basket: false },
    css_ordering_capabilities: { authenticated: true, company_context: true, company_active: true, can_checkout: !blocked },
    customer: { addresses },
    customerCart: { id: "cart", total_quantity: 1, shipping_addresses: existing ? [existing] : [] },
  };
  const actions = load(root, "app/checkout/delivery/defaults.ts", {
    "next/navigation": { redirect: (url) => { throw new Navigation(url); }, unstable_rethrow: (error) => { if (error instanceof Navigation) throw error; } },
    "@/lib/checkout-defaults": helpers,
    "@/lib/magento/shipping": {
      getDeliveryContext: async () => context,
      setSavedShippingAddress: async (_token, _cart, id) => {
        calls.push(["address", id]);
        context.customerCart.shipping_addresses = [{ ...shipping }];
      },
      setShippingMethod: async (_token, _cart, carrier, method) => {
        calls.push(["rate", carrier, method]);
        return { id: "cart", shipping_addresses: [{ ...shipping, selected_shipping_method: badRate ? null : rate }] };
      },
    },
    "@/lib/magento/employee": { getEmployeeOrdering: async () => ({ usesEmployee: true, multiEmployeeBasket: false, employees: [{ employee_id: 7 }] }) },
    "@/lib/session": { requireCustomerToken: async () => "token" },
    "@/lib/company-delivery-policy": {
      readCompanyDeliveryPolicy: async () => ({ mode: "UNRESTRICTED", addressBookLocked: false }),
      companyDefaultAddress: (context) => helpers.defaultSavedAddress(context.customer.addresses),
      companyDestinationReady: () => true,
      assertCompanyCartDestination: async () => {},
    },
    "@/lib/punchout/guard": { assertNormalCheckoutSession: async () => { if (punchout) throw new Error("PunchOut"); } },
    "@/lib/employee-delivery-review": { assertEmployeeDeliveryReviewComplete: async () => { if (pending) throw new Error("Confirm Employee delivery"); } },
    "@/lib/controlled-employee-delivery": {
      selectedCartEmployeeId: () => 7,
      controlledDeliveryApplies: async () => controlled,
      assertControlledCartReady: async () => { throw new Error("Recipient required"); },
    },
    "@/lib/employee-catalogue": { assertEmployeeCatalogueCartReady: async () => {} },
  });
  return { calls, async run() {
    const form = new FormData();
    form.set("cart_id", "cart"); form.set("company_id", "3"); form.set("customer_id", "2");
    try { await actions.applyCheckoutDefaultsAction(form); assert.fail("Expected redirect"); }
    catch (error) { assert.ok(error instanceof Navigation, String(error)); return error.url; }
  } };
}

test("automatic POST writes default address then sole rate and returns to delivery", async () => {
  const f = fixture();
  assert.equal(await f.run(), "/checkout/delivery?defaults=done");
  assert.deepEqual(f.calls, [["address", 12], ["rate", "ogldelivery", "company"]]);
});

test("existing address, multiple rates and retained selections are not overwritten", async () => {
  const f = fixture({ existing: { ...shipping, available_shipping_methods: [rate, other] } });
  await f.run(); assert.deepEqual(f.calls, []);
  const selected = fixture({ existing: { ...shipping, selected_shipping_method: rate } });
  await selected.run(); assert.deepEqual(selected.calls, []);
});

test("stale company, denied checkout, PunchOut, pending Employee or missing recipient never writes", async () => {
  for (const params of [{ company: 9 }, { blocked: true }, { punchout: true }, { employee: true, pending: true }, { employee: true, controlled: true, existing: shipping }]) {
    const f = fixture(params);
    assert.match(await f.run(), /error=/);
    assert.deepEqual(f.calls, []);
  }
});

test("Employee default address is never substituted; confirmed Employee can auto-select a sole rate", async () => {
  const missing = fixture({ employee: true });
  await missing.run(); assert.deepEqual(missing.calls, []);
  const existing = fixture({ employee: true, existing: shipping });
  await existing.run(); assert.deepEqual(existing.calls, [["rate", "ogldelivery", "company"]]);
});

test("failed Magento rate readback returns to manual checkout rather than claiming success", async () => {
  const f = fixture({ existing: shipping, badRate: true });
  assert.match(await f.run(), /error=/);
  assert.deepEqual(f.calls, [["rate", "ogldelivery", "company"]]);
});

test("auto POST never runs on GET; sole payment remains on existing final submission and PO retry route", () => {
  const page = readFileSync(new URL("../app/checkout/delivery/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/checkout-delivery-defaults.tsx", import.meta.url), "utf8");
  const payment = readFileSync(new URL("../app/checkout/payment/page.tsx", import.meta.url), "utf8");
  const action = readFileSync(new URL("../app/checkout/payment/actions.ts", import.meta.url), "utf8");
  assert.match(page, /!messages.error && messages.defaults !== "done"/);
  assert.doesNotMatch(page, /await applyCheckoutDefaultsAction/);
  assert.match(client, /form.current.requestSubmit\(\)/);
  assert.match(payment, /methods.length === 1[\s\S]*?name="payment_method" value=\{methods\[0\].code\}/);
  assert.match(action, /available_payment_methods.find/);
  assert.match(action, /setCheckoutPaymentMethod\(/);
  assert.match(action, /PO Number is required/);
});
