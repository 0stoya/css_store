import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relative) => readFileSync(path.join(root, relative), "utf8");

test("only current Magento customer's saved address IDs are eligible", () => {
  const lib = load(root, "lib/employee-delivery-address.ts", {
    postgres: { default: () => { throw new Error("unexpected database read"); } },
  });
  assert.equal(lib.chooseOwnedSavedAddress(1000, [1000, 2000]), 1000);
  assert.equal(lib.chooseOwnedSavedAddress(1000, [2000]), null);
  assert.equal(lib.chooseOwnedSavedAddress(null, [1000]), null);
  assert.equal(lib.chooseOwnedSavedAddress(-1, [1000]), null);
  assert.equal(lib.chooseOwnedSavedAddress(1.5, [1000]), null);
});

test("lookup is scoped to authenticated Magento company/customer and validated Employee", () => {
  const lib = source("lib/employee-delivery-address.ts");
  assert.match(lib, /company_id = \$\{companyId\}/);
  assert.match(lib, /owner_customer_id = \$\{ownerCustomerId\}/);
  assert.match(lib, /employee_id = \$\{employeeId\}/);
  assert.match(lib, /SELECT customer_address_id/);
  assert.doesNotMatch(lib, /INSERT INTO|UPDATE css_admin|DELETE FROM/);
});

test("Employee selection keeps native address and payment paths", () => {
  const action = source("app/checkout/employee/actions.ts");
  assert.match(action, /assignCartEmployee\(token, cart\.id, employeeId\)/);
  assert.match(action, /getAssignedEmployeeDeliveryAddress\(companyId, customerId, employeeId\)/);
  assert.match(action, /chooseOwnedSavedAddress/);
  assert.match(action, /setSavedShippingAddress\(token, cart\.id, ownedId\)/);
  assert.match(action, /markEmployeeDeliveryReviewPending\(cart\.id\)/);
  const delivery = source("app/checkout/delivery/actions.ts");
  assert.match(delivery, /await setSavedShippingAddress\(token, cart\.id, addressId\);\n    await clearEmployeeDeliveryReview/);
  assert.match(delivery, /await setNewShippingAddress/);
  const payment = source("app/checkout/payment/actions.ts");
  assert.match(payment, /await assertEmployeeDeliveryReviewComplete\(cart\.id\)/);
  assert.match(payment, /await assertEmployeeDeliveryReviewComplete\(initialCart\.id\)/);
});

class Navigation extends Error {
  constructor(location) { super(location); this.location = location; }
}

function actionFixture(mappedId, ownedAddresses) {
  const calls = [];
  const actions = load(root, "app/checkout/employee/actions.ts", {
    "next/navigation": {
      redirect: (url) => { throw new Navigation(url); },
      unstable_rethrow: (error) => { if (error instanceof Navigation) throw error; },
    },
    "@/lib/session": { requireCustomerToken: async () => "token" },
    "@/lib/magento/cart": {
      getCustomerCartWriteContext: async () => ({ id: "cart-1", itemsV2: { items: [{ uid: "item-1" }] } }),
      assignCartEmployee: async () => { calls.push("assign"); },
    },
    "@/lib/magento/employee": { getEmployeeOrdering: async () => ({
      usesEmployee: true, multiEmployeeBasket: false, employees: [{ employee_id: 1234 }],
    }) },
    "@/lib/magento/shipping": {
      getDeliveryContext: async () => ({
        customerCart: { id: "cart-1" },
        css_company_context: { customer_id: 22, selected_company_id: 14 },
        customer: { addresses: ownedAddresses.map((id) => ({ id })) },
      }),
      setSavedShippingAddress: async (_token, _cart, address) => { calls.push("ship:" + address); },
    },
    "@/lib/employee-delivery-address": {
      employeeAddressMappingConfigured: () => true,
      getAssignedEmployeeDeliveryAddress: async () => mappedId,
      chooseOwnedSavedAddress: (stored, saved) => stored && saved.includes(stored) ? stored : null,
    },
    "@/lib/employee-delivery-review": {
      markEmployeeDeliveryReviewPending: async () => { calls.push("pending"); },
      clearEmployeeDeliveryReview: async () => { calls.push("clear"); },
    },
  });
  return { actions, calls };
}

for (const [name, mappedId, ownedAddresses, expected] of [
  ["valid mapping", 1000, [1000], ["assign", "pending", "ship:1000", "clear"]],
  ["unassigned", null, [1000], ["assign", "pending"]],
  ["wrong owner", 1000, [2000], ["assign", "pending"]],
]) {
  test("checkout Employee choice: " + name, async () => {
    const { actions, calls } = actionFixture(mappedId, ownedAddresses);
    const data = new FormData(); data.set("employee_id", "1234");
    await assert.rejects(() => actions.selectCheckoutEmployeeAction(data), Navigation);
    assert.deepEqual(calls, expected);
  });
}

test("isolated address staging blocks both native and credit-order submission", () => {
  const sourceText = source("app/checkout/payment/actions.ts");
  assert.match(sourceText, /CSS_EMPLOYEE_ADDRESS_STAGING_NO_SUBMIT/);
  assert.match(sourceText, /Order placement is disabled on the Employee address staging instance/);
  assert.match(sourceText, /if \(typeof process !== "undefined"/);
  assert.ok(
    sourceText.indexOf("CSS_EMPLOYEE_ADDRESS_STAGING_NO_SUBMIT")
      < sourceText.indexOf("const token = await requireCustomerToken();", sourceText.indexOf("export async function completeCheckoutAction")),
    "staging guard must precede any checkout action",
  );
});
