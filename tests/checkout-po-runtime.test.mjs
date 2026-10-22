import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

class Navigation extends Error {
  constructor(location) {
    super(location);
    this.location = location;
  }
}

class MagentoGraphQLError extends Error {
  constructor(message, category = undefined, status = 200) {
    super(message);
    this.category = category;
    this.status = status;
  }
}

function checkoutContext(creditEnabled) {
  return {
    css_ordering_capabilities: {
      authenticated: true,
      company_context: true,
      company_active: true,
      can_checkout: true,
      can_submit_credit_order: creditEnabled,
    },
    customerCart: {
      id: "cart-test",
      total_quantity: 1,
      itemsV2: { items: [] },
      shipping_addresses: [{ selected_shipping_method: { method_code: "company" } }],
      available_payment_methods: [{ code: "payment_account", title: "Payment on Account" }],
      selected_payment_method: { code: "payment_account", title: "Payment on Account" },
      css_purchase_eligibility: { approval_status: "ALLOWED" },
    },
  };
}

async function simulate({
  creditEnabled = true,
  poRequiredByFluid = false,
  poRequested = false,
  poNumber = "",
} = {}) {
  const calls = [];
  const context = checkoutContext(creditEnabled);
  const actions = loadTypeScript(root, "app/checkout/payment/actions.ts", {
    "next/navigation": {
      redirect: (url) => { throw new Navigation(url); },
      unstable_rethrow: (error) => { if (error instanceof Navigation) throw error; },
    },
    "@/lib/magento/client": { MagentoGraphQLError },
    "@/lib/session": { requireCustomerToken: async () => "test-customer-token" },
    "@/lib/employee-delivery-review": { assertEmployeeDeliveryReviewComplete: async () => {} },
    "@/lib/controlled-employee-delivery": { assertControlledCartReady: async () => ({ controlled: false }) },
    "@/lib/magento/employee": {
      getEmployeeOrdering: async () => ({
        usesEmployee: false, multiEmployeeBasket: false, employees: [],
      }),
    },
    "@/lib/magento/checkout": {
      getCheckoutContext: async () => {
        calls.push({ action: "read" });
        return context;
      },
      setBillingSameAsShipping: async () => { calls.push({ action: "billing" }); },
      setCheckoutPaymentMethod: async (token, cartId, code, purchaseOrderNumber) => {
        calls.push({ action: "payment", token, cartId, code, purchaseOrderNumber });
      },
      submitCreditOrder: async () => {
        calls.push({ action: "credit" });
        if (poRequiredByFluid) throw new MagentoGraphQLError("PO Number is required.");
        return {
          credit_order_id: 23,
          credit_order_number: "000000023",
          status: "approval_required",
          approval_required: true,
          auto_approved: false,
          order_placed: false,
          order_number: null,
        };
      },
      placeCheckoutOrder: async () => {
        calls.push({ action: "native" });
        return { order_number: "10000023" };
      },
    },
  });

  const form = new FormData();
  form.set("payment_method", "payment_account");
  if (poRequested) form.set("po_requested", "1");
  if (poNumber) form.set("purchase_order_number", poNumber);

  try {
    await actions.completeCheckoutAction(form);
    assert.fail("checkout action must redirect");
  } catch (error) {
    assert.ok(error instanceof Navigation, String(error));
    return { url: new URL(error.location, "https://store.example.invalid"), calls };
  }
}

test("requester without a PO-entry requirement submits credit order unchanged", async () => {
  const { url, calls } = await simulate();
  assert.equal(url.pathname, "/checkout/confirmation");
  assert.equal(url.searchParams.get("approval"), "1");
  assert.equal(url.searchParams.has("po"), false);
  assert.equal(calls.filter((x) => x.action === "credit").length, 1);
  const payment = calls.find((x) => x.action === "payment");
  assert.equal(payment.purchaseOrderNumber, undefined);
  assert.equal(payment.cartId, "cart-test");
  assert.equal(calls.some((x) => x.action === "native"), false);
});

test("Fluid's exact PO-required error prompts for PO rather than submitting an order", async () => {
  const { url, calls } = await simulate({ poRequiredByFluid: true });
  assert.equal(url.pathname, "/checkout/payment");
  assert.equal(url.searchParams.get("po"), "required");
  // Mocked MagentoGraphQLError crosses the isolated VM boundary; Error instanceof
  // can intentionally fall back to generic copy. PO prompt activation is the
  // invariant, not a particular text rendering of the upstream exception.
  assert.ok(url.searchParams.get("error"));
  assert.equal(calls.filter((x) => x.action === "credit").length, 1);
  assert.equal(calls.some((x) => x.action === "native"), false);
  assert.equal(calls.find((x) => x.action === "payment").purchaseOrderNumber, undefined);
});

test("PO retry supplies exact verified PO through the existing credit-order route", async () => {
  const { url, calls } = await simulate({ poRequested: true, poNumber: "PO-12345" });
  assert.equal(url.pathname, "/checkout/confirmation");
  assert.equal(url.searchParams.get("kind"), "credit");
  assert.equal(url.searchParams.get("credit"), "000000023");
  assert.equal(calls.find((x) => x.action === "payment").purchaseOrderNumber, "PO-12345");
  assert.equal(calls.find((x) => x.action === "payment").token, "test-customer-token");
  assert.equal(calls.filter((x) => x.action === "credit").length, 1);
});

test("invalid or missing requested PO never reaches the payment mutation or credit submission", async () => {
  for (const poNumber of ["", "PO 123", "PO@123", "A".repeat(17)]) {
    const { url, calls } = await simulate({ poRequested: true, poNumber });
    assert.equal(url.pathname, "/checkout/payment");
    assert.equal(url.searchParams.get("po"), "required");
    assert.ok(url.searchParams.get("error"));
    assert.equal(calls.some((x) => x.action === "payment"), false);
    assert.equal(calls.some((x) => x.action === "credit"), false);
    assert.equal(calls.some((x) => x.action === "native"), false);
  }
});

test("a native-checkout user cannot force PO forwarding by POSTing form fields", async () => {
  const { url, calls } = await simulate({
    creditEnabled: false, poRequested: true, poNumber: "PO-123",
  });
  assert.equal(url.pathname, "/checkout/payment");
  assert.equal(url.searchParams.has("po"), false);
  assert.equal(calls.some((x) => x.action === "payment"), false);
  assert.equal(calls.some((x) => x.action === "native"), false);
});
