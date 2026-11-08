import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const FLAG = "CSS_STORE_OPEN_EMPLOYEE_PURCHASING_ENABLED";

async function withFlag(value, callback) {
  const previous = process.env[FLAG];
  try {
    if (value === null) delete process.env[FLAG];
    else process.env[FLAG] = value;
    await callback();
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
}

test("flag OFF: existing manager-scoped Magento Employee query and paging stay intact", async () => {
  await withFlag("0", async () => {
    const pages = [];
    const employee = load(root, "lib/magento/employee.ts", {
      "@/lib/magento/client": { magentoGraphQL: async (query, variables) => {
        assert.match(query, /css_company_employees/);
        assert.doesNotMatch(query, /css_company_buyable_employees/);
        pages.push(variables.page);
        return { css_company_employees: {
          items: [{ employee_id: variables.page, full_name: "Employee " + variables.page,
            employee_code: null, department: null, active: true, company_id: 14, purchase_control_role_id: 8 }],
          page_info: { current_page: variables.page, total_pages: 3 },
        } };
      } },
    });
    const result = await employee.getActiveEmployees("buyer");
    assert.deepEqual(pages, [1, 2, 3]);
    assert.deepEqual(Array.from(result, (row) => row.employee_id), [1, 2, 3]);
    assert.equal(result[0].company_id, 14);
  });
});

test("flag ON: purchase-only Magento query covers all pages without inventing management fields", async () => {
  await withFlag("1", async () => {
    const pages = [];
    const employee = load(root, "lib/magento/employee.ts", {
      "@/lib/magento/client": { magentoGraphQL: async (query, variables) => {
        assert.match(query, /css_company_buyable_employees/);
        assert.doesNotMatch(query, /css_company_employees\(/);
        assert.doesNotMatch(query, /manager_company_user_id|purchase_control_role_id|company_id/);
        pages.push(variables.page);
        return { css_company_buyable_employees: {
          total_count: 2,
          items: [{ employee_id: variables.page,
            employee_code: null, full_name: "Employee " + variables.page, department: null }],
          page_info: { current_page: variables.page, total_pages: 2 },
        } };
      } },
    });
    const result = await employee.getActiveEmployees("buyer");
    assert.deepEqual(pages, [1, 2]);
    assert.deepEqual(Array.from(result, (row) => row.employee_id), [1, 2]);
    assert.equal(result[0].company_id, null);
    assert.equal(result[0].purchase_control_role_id, null);
  });
});

test("bad/incomplete purchase-only paging fails closed", async () => {
  await withFlag("1", async () => {
    const employee = load(root, "lib/magento/employee.ts", {
      "@/lib/magento/client": { magentoGraphQL: async () => ({ css_company_buyable_employees: {
        total_count: 4,
        items: [{ employee_id: 1, full_name: "Employee One", employee_code: null, department: null }],
        page_info: { current_page: 1, total_pages: 1 },
      } }) },
    });
    await assert.rejects(() => employee.getActiveEmployees("buyer"), /incomplete Employee purchase scope/);
  });
});

test("changed paging metadata is rejected in legacy mode", async () => {
  await withFlag("0", async () => {
    const employee = load(root, "lib/magento/employee.ts", {
      "@/lib/magento/client": { magentoGraphQL: async () => ({ css_company_employees: {
        items: [], page_info: { current_page: 1, total_pages: 51 },
      } }) },
    });
    await assert.rejects(() => employee.getActiveEmployees("buyer"), /too large or its pagination changed/);
  });
});

test("controlled delivery cannot borrow the original manager's address in open mode", async () => {
  const controlled = load(root, "lib/controlled-employee-delivery.ts", {
    "@/lib/employee-delivery-address": {
      getControlledEmployeeDeliveryEnabled: async () => true,
      getAssignedEmployeeDeliveryAddress: async () => { throw new Error("not reached"); },
    },
    "@/lib/magento/shipping": {},
  });
  const delivery = {
    css_company_employee_configuration: {
      uses_employee: true, multi_employee_basket: false, open_employee_purchasing: true,
    },
    css_company_context: { selected_company_id: 14 },
  };
  await assert.rejects(() => controlled.controlledDeliveryApplies(delivery),
    /incompatible with Controlled Employee delivery/);
});

test("selection validates actual Magento role; checkout keeps native authority", () => {
  const chooser = source("app/catalogue/actions.ts");
  const shipping = source("lib/magento/shipping.ts");
  const cart = source("lib/magento/cart.ts");
  const payment = source("app/checkout/payment/actions.ts");
  assert.match(chooser, /getEmployeeCataloguePolicy\(token, mode\.companyId, employeeId\)/);
  assert.match(chooser, /openEmployeePurchasingApiEnabled\(\)/);
  assert.match(shipping, /openEmployeePurchasingApiEnabled\(\) \? DELIVERY_CONTEXT_OPEN : DELIVERY_CONTEXT/);
  assert.match(cart, /cssAssignCartEmployee/);
  assert.match(cart, /cssAssignCartItemEmployee/);
  assert.match(payment, /assertControlledCartReady/);
  assert.match(payment, /css_purchase_eligibility/);
});
