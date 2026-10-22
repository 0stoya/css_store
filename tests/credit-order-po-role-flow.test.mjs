import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function paymentFixture() {
  const requests = [];
  const checkout = loadTypeScript(root, "lib/magento/checkout.ts", {
    "@/lib/magento/client": {
      magentoGraphQL: async (query, variables, token) => {
        requests.push({ query, variables, token });
        return {
          setPaymentMethodOnCart: {
            cart: {
              id: variables.cartId,
              selected_payment_method: { code: variables.code, title: "Payment on Account" },
            },
          },
        };
      },
    },
  });
  return { checkout, requests };
}

test("ordinary credit request and native payment retain original no-PO mutation", async () => {
  const { checkout, requests } = paymentFixture();
  const cart = await checkout.setCheckoutPaymentMethod("buyer-token", "cart-1", "companycredit");
  assert.equal(cart.id, "cart-1");
  assert.equal(requests.length, 1);
  assert.match(requests[0].query, /mutation StoreSetPaymentMethod\(/);
  assert.doesNotMatch(requests[0].query, /purchase_order_number/);
  assert.equal(requests[0].variables.code, "companycredit");
  assert.equal(requests[0].variables.purchaseOrderNumber, undefined);
  assert.equal(requests[0].token, "buyer-token");
});

test("server forwards a validated requested PO through existing Magento payment input", async () => {
  const { checkout, requests } = paymentFixture();
  await checkout.setCheckoutPaymentMethod("buyer-token", "cart-1", "companycredit", "PO-12345");
  assert.equal(requests.length, 1);
  assert.match(requests[0].query, /mutation StoreSetPaymentMethodWithPo\(/);
  assert.match(requests[0].query, /purchase_order_number: \$purchaseOrderNumber/);
  assert.equal(requests[0].variables.purchaseOrderNumber, "PO-12345");
  assert.equal(requests[0].variables.code, "companycredit");
  assert.equal(requests[0].variables.cartId, "cart-1");
  assert.equal(requests[0].token, "buyer-token");
  assert.doesNotMatch(requests[0].query, /cssAdmin|css_admin/);
});

test("checkout reveals a required PO only after the existing Fluid validator asks for it", () => {
  const page = source("app/checkout/payment/page.tsx");
  const action = source("app/checkout/payment/actions.ts");
  assert.match(page, /const poRequired = usesCreditOrder && messages\.po === "required";/);
  assert.match(page, /\{poRequired \? <section className="payment-po-required"/);
  assert.match(page, /name="po_requested" value="1"/);
  assert.match(page, /name="purchase_order_number"/);
  assert.match(page, /required\s+maxLength=\{16\}\s+pattern="\[A-Za-z0-9-\]\{1,16\}"/);
  assert.match(action, /error instanceof MagentoGraphQLError && \/\^PO Number is required/);
  assert.match(action, /creditFlow = initial\.css_ordering_capabilities\.can_submit_credit_order/);
  assert.match(action, /creditFlow \? purchaseOrderNumber \|\| undefined : undefined/);
  assert.match(action, /\^\[A-Za-z0-9-\]\{1,16\}\$/);
  assert.doesNotMatch(page + action, /can_auto_approve_credit_order/);
  assert.doesNotMatch(page + action, /company_employees_manage|enter_po_numbers/);
});

test("native and Fluid checkout authorisation remain unchanged", () => {
  const action = source("app/checkout/payment/actions.ts");
  const model = source("lib/magento/checkout.ts");
  assert.match(action, /await assertEmployeeDeliveryReviewComplete/);
  assert.match(action, /await assertControlledCartReady/);
  assert.match(action, /if \(cart\.id !== initialCart\.id\)/);
  assert.match(action, /if \(current\.css_ordering_capabilities\.can_submit_credit_order\)/);
  assert.match(action, /await submitCreditOrder\(token, cart\.id\)/);
  assert.match(action, /cart\.css_purchase_eligibility\?\.approval_status !== "ALLOWED"/);
  assert.match(model, /mutation StoreSubmitCreditOrder/);
  assert.match(model, /mutation StorePlaceOrder/);
});

test("approver actions remain two separate backend-authorised lifecycle operations", () => {
  const detail = source("app/account/credit-orders/[number]/page.tsx");
  const actions = source("app/account/credit-orders/actions.ts");
  const creditClient = source("lib/magento/credit-orders.ts");

  assert.match(actions, /result\.status === "approval_required" \|\| result\.status === "pending"/);
  assert.match(actions, /Approval recorded\. This order is waiting for another approval/);
  assert.match(actions, /An authorised user can add a PO number below if required/);
  assert.match(actions, /performCreditOrderAction\(/);
  assert.match(actions, /await setCreditOrderPurchaseOrderNumber\(token, number, purchaseOrderNumber\)/);
  assert.match(detail, /order\.actions\.can_approve \?/);
  assert.match(detail, /Only users granted Enter PO Numbers may complete this step/);
  assert.match(creditClient, /cssSetCreditOrderPurchaseOrderNumber/);
  assert.match(creditClient, /cssApproveCreditOrder/);
  assert.doesNotMatch(actions, /adminToken|css_admin_/);
});
