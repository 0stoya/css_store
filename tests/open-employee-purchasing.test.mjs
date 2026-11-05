import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Store fetches every authorised Employee page without HR GraphQL", async () => {
  const pages = [];
  const employee = load(root, "lib/magento/employee.ts", {
    "@/lib/magento/client": { magentoGraphQL: async (query, variables) => {
      assert.match(query, /css_company_employees/);
      assert.doesNotMatch(query, /css_company_employees\(/);
      pages.push(variables.page);
      return { css_company_employees: {
        items: [{ employee_id: variables.page, full_name: "Employee " + variables.page, employee_code: null, department: null }],
        page_info: { current_page: variables.page, total_pages: 3 },
      } };
    } },
  });
  const result = await employee.getActiveEmployees("buyer");
  assert.deepEqual(pages, [1, 2, 3]);
  assert.deepEqual(Array.from(result, (row) => row.employee_id), [1, 2, 3]);
});

test("Changed paging metadata is rejected, never shown as a complete list", async () => {
  const employee = load(root, "lib/magento/employee.ts", {
    "@/lib/magento/client": { magentoGraphQL: async () => ({ css_company_employees: {
      items: [], page_info: { current_page: 1, total_pages: 51 },
    } }) },
  });
  await assert.rejects(() => employee.getActiveEmployees("buyer"), /too large or its pagination changed/);
});

test("Controlled delivery cannot borrow manager's saved address in open mode", async () => {
  const controlled = load(root, "lib/controlled-employee-delivery.ts", {
    "@/lib/employee-delivery-address": {
      getControlledEmployeeDeliveryEnabled: async () => true,
      getAssignedEmployeeDeliveryAddress: async () => { throw new Error("not reached"); },
    },
    "@/lib/magento/shipping": {},
  });
  const delivery = {
    css_company_employee_configuration: { uses_employee: true, multi_employee_basket: false, open_employee_purchasing: true },
    css_company_context: { selected_company_id: 14 },
  };
  await assert.rejects(() => controlled.controlledDeliveryApplies(delivery), /incompatible with Controlled Employee delivery/);
});

test("Checkout still uses native assignment, credit and purchase controls", () => {
  const cart = source("lib/magento/cart.ts");
  const payment = source("app/checkout/payment/actions.ts");
  assert.match(cart, /cssAssignCartEmployee/);
  assert.match(cart, /cssAssignCartItemEmployee/);
  assert.match(payment, /assertControlledCartReady/);
  assert.match(payment, /css_purchase_eligibility/);
});
