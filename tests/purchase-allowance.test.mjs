import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import load from "./helpers/load-typescript.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const { purchaseAllowanceView: view, checkoutSubmitLabel: label } = load(root, "lib/purchase-allowance.ts");
const decision = (overrides = {}) => ({
  logical_product_id: 17, has_active_restriction: true, allowed_quantity: 4,
  purchased_quantity: 2, remaining_quantity: 2, requested_quantity: 3,
  status: "APPROVAL_REQUIRED", reason: "QUANTITY_LIMIT_EXCEEDED", ...overrides,
});
const item = (id, name, group = null) => ({ product: { allowance_product_id: id, name }, css_kit: group ? { parent_kit_product_id: group } : null });
const eligibility = (status, items) => ({ approval_status: status, items });

test("null eligibility is not invented as ALLOWED or zero allowance", () => assert.equal(view(null, []), null));
test("unknown status is explicitly unavailable", () => assert.equal(view(eligibility("FUTURE_STATUS", []), []).unavailable, true));
test("unrestricted buyer without active records gets no generic allowance block", () => {
  assert.equal(view(eligibility("ALLOWED", [decision({ has_active_restriction: false, reason: "NO_ACTIVE_RESTRICTION" })]), []), null);
});
test("an overall ALLOWED decision is never overridden by per-product diagnostics", () => {
  const result = view(eligibility("ALLOWED", [decision()]), [item(17, "Coverall")]);
  assert.equal(result.requiresApproval, false);
  assert.equal(result.rows[0].showRecordedExcess, false);
});
test("within-limit figures are shown unchanged, not reduced by this basket twice", () => {
  const result = view(eligibility("ALLOWED", [decision({ requested_quantity: 1, status: "ALLOWED", reason: null })]), [item(17, "Coverall")]);
  assert.equal(result.rows[0].remaining_quantity, 2);
  assert.equal(result.rows[0].requested_quantity, 1);
  assert.equal(result.rows[0].label, "Coverall");
});
test("approval-required basket uses backend aggregate and reason", () => {
  const result = view(eligibility("APPROVAL_REQUIRED", [decision()]), [item(17, "Coverall")]);
  assert.equal(result.requiresApproval, true);
  assert.equal(result.rows[0].showRecordedExcess, true);
  assert.equal(result.rows[0].requested_quantity, 3);
});
test("value/all approval with no active allowance is not described as quantity failure", () => {
  const result = view(eligibility("APPROVAL_REQUIRED", [decision({ has_active_restriction: false, reason: "NO_ACTIVE_RESTRICTION" })]), []);
  assert.equal(result.requiresApproval, true);
  assert.equal(result.rows.length, 0);
});
test("grouped sizes/employees share one backend decision, not separate limits", () => {
  const result = view(eligibility("APPROVAL_REQUIRED", [decision()]), [item(101, "Coverall S", 17), item(102, "Coverall M", 17)]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].requested_quantity, 3);
  assert.equal(result.rows[0].label, "Coverall S / Coverall M");
});
test("duplicate decision IDs are not rendered twice", () => assert.equal(view(eligibility("ALLOWED", [decision(), decision()]), []).rows.length, 1));
test("unknown product mapping is identified honestly, never assigned by array position", () => {
  assert.equal(view(eligibility("ALLOWED", [decision()]), [item(99, "Unrelated")]).rows[0].label, "Product allowance #17");
});
for (const invalid of [-1, NaN, Infinity]) {
  test(`invalid quantity ${invalid} is not rendered as usable allowance`, () => {
    assert.equal(view(eligibility("APPROVAL_REQUIRED", [decision({ remaining_quantity: invalid })]), []).rows.length, 0);
  });
}
test("fractional requested quantity is preserved", () => assert.equal(view(eligibility("ALLOWED", [decision({ requested_quantity: 1.25 })]), []).rows[0].requested_quantity, 1.25));
test("credit workflow does not always imply an approval-required button", () => {
  assert.equal(label(true, "ALLOWED"), "Submit order");
  assert.equal(label(true, "APPROVAL_REQUIRED"), "Submit for approval");
  assert.equal(label(false, "ALLOWED"), "Place order");
});

test("checkout query requests all display fields without changing placement mutations", async () => {
  const calls = [];
  const checkout = load(root, "lib/magento/checkout.ts", {
    "@/lib/magento/client": { magentoGraphQL: async (query, variables, token) => {
      calls.push({ query, variables, token });
      return { placeOrder: { order: { order_number: "X" } }, cssSubmitCreditOrder: { credit_order_id: 1 } };
    } },
  });
  await checkout.getCheckoutContext("test-token");
  for (const field of ["approval_status", "logical_product_id", "has_active_restriction", "allowed_quantity", "purchased_quantity", "remaining_quantity", "requested_quantity", "reason", "allowance_product_id: id"]) assert.ok(calls[0].query.includes(field));
  await checkout.placeCheckoutOrder("test-token", "cart");
  await checkout.submitCreditOrder("test-token", "cart");
  assert.match(calls[1].query, /placeOrder\(input/);
  assert.match(calls[2].query, /cssSubmitCreditOrder\(input/);
  assert.equal(calls[1].variables.cartId, "cart");
  assert.equal(calls[2].variables.cartId, "cart");
});

test("basket read has labels and decisions; cart write queries stay minimal", async () => {
  const calls = [];
  const cart = load(root, "lib/magento/cart.ts", {
    "@/lib/magento/client": { MagentoGraphQLError: Error, magentoGraphQL: async (query) => {
      calls.push(query);
      return { customerCart: {}, updateCartItems: { cart: {} } };
    } },
  });
  await cart.getCustomerCart("token");
  await cart.updateCartItem("token", "cart", "item", 2);
  assert.match(calls[0], /allowance_product_id: id/);
  assert.match(calls[0], /css_purchase_eligibility/);
  assert.doesNotMatch(calls[1], /css_purchase_eligibility/);
});

class Navigation extends Error {
  constructor(location) { super(location); this.location = location; }
}
const readyContext = (status = "ALLOWED", credit = false) => ({
  css_ordering_capabilities: { authenticated: true, company_context: true, company_active: true, can_checkout: true, can_submit_credit_order: credit },
  customerCart: {
    id: "cart", total_quantity: 3, shipping_addresses: [{ selected_shipping_method: {} }],
    available_payment_methods: [{ code: "checkmo", title: "Invoice" }],
    selected_payment_method: { code: "checkmo" },
    css_purchase_eligibility: status === null ? null : eligibility(status, [decision()]),
  },
});
async function submitWithContexts(initial, current) {
  const calls = [];
  let reads = 0;
  const actions = load(root, "app/checkout/payment/actions.ts", {
    "next/navigation": {
      redirect: (location) => { throw new Navigation(location); },
      unstable_rethrow: (error) => { if (error instanceof Navigation) throw error; },
    },
    "@/lib/session": { requireCustomerToken: async () => "token" },
    "@/lib/magento/checkout": {
      getCheckoutContext: async () => { reads++; return reads === 1 ? initial : current; },
      setBillingSameAsShipping: async () => {}, setCheckoutPaymentMethod: async () => {},
      placeCheckoutOrder: async () => { calls.push("native"); return { order_number: "X" }; },
      submitCreditOrder: async () => { calls.push("credit"); return { credit_order_id: 1 }; },
    },
  });
  const data = new FormData(); data.set("payment_method", "checkmo");
  try { await actions.completeCheckoutAction(data); assert.fail("expected navigation"); }
  catch (error) {
    assert.ok(error instanceof Navigation, String(error));
    return { calls, reads, url: new URL(error.location, "https://app.invalid") };
  }
}
test("native checkout uses the refreshed overall result, not per-row diagnostics", async () => {
  const result = await submitWithContexts(readyContext(), readyContext());
  assert.deepEqual(result.calls, ["native"]);
  assert.equal(result.reads, 2);
  assert.equal(result.url.pathname, "/checkout/confirmation");
});
for (const status of ["APPROVAL_REQUIRED", null, "UNKNOWN"]) {
  test(`native checkout rejects refreshed ${status} after an initially allowed basket`, async () => {
    const result = await submitWithContexts(readyContext(), readyContext(status));
    assert.equal(result.calls.length, 0);
    assert.equal(result.reads, 2);
    assert.equal(result.url.pathname, "/checkout/payment");
    assert.ok(result.url.searchParams.has("error"));
  });
}
test("credit-enabled checkout remains in the Fluid workflow even when allowed", async () => {
  const result = await submitWithContexts(readyContext("ALLOWED", true), readyContext("ALLOWED", true));
  assert.deepEqual(result.calls, ["credit"]);
  assert.equal(result.url.pathname, "/checkout/confirmation");
});
test("a changed basket is not submitted", async () => {
  const current = readyContext(); current.customerCart.id = "another-cart";
  const result = await submitWithContexts(readyContext(), current);
  assert.equal(result.calls.length, 0);
  assert.equal(result.url.pathname, "/checkout/payment");
});
