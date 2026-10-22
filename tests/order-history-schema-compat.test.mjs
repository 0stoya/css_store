import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("company orders query requests only supported item price fields", async () => {
  const calls = [];
  const orders = loadTypeScript(root, "lib/magento/orders.ts", {
    "@/lib/magento/client": {
      magentoGraphQL: async (query, variables, token) => {
        calls.push({ query, variables, token });
        if (/prices\s*\{/.test(query)) {
          throw new Error('Cannot query field "prices" on type "OrderItemInterface".');
        }
        return {
          css_company_orders: {
            total_count: 1,
            page_info: { page_size: 10, current_page: 1, total_pages: 1 },
            items: [{
              number: "100000001", order_date: "2026-10-21", status: "Complete",
              items: [{ id: "1", product_sku: "A800", product_name: "Work glove",
                quantity_ordered: 2, product_sale_price: { value: 4.2, currency: "GBP" } }],
              total: { grand_total: { value: 8.4, currency: "GBP" } },
            }],
          },
        };
      },
    },
  });
  const result = await orders.getCompanyOrders("company-user-token", 1, 10);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /css_company_orders\(currentPage:/);
  assert.match(calls[0].query, /product_sale_price\s*\{\s*value currency\s*\}/);
  assert.doesNotMatch(calls[0].query, /\bprices\s*\{/);
  assert.match(calls[0].query, /css_employee\s*\{/);
  assert.match(calls[0].query, /selected_options/);
  assert.equal(calls[0].token, "company-user-token");
  assert.equal(calls[0].variables.currentPage, 1);
  assert.equal(result.css_company_orders.total_count, 1);
  assert.equal(result.css_company_orders.items[0].items[0].product_sale_price.value, 4.2);
});

test("UI shows verified unit price and order-level totals but does not invent item row totals", () => {
  const page = source("app/account/orders/page.tsx");
  const orders = source("lib/magento/orders.ts");
  assert.match(page, /money\(item\.product_sale_price\)/);
  assert.match(page, /money\(order\.total\?\.grand_total\)/);
  assert.match(page, /quantity_ordered/);
  assert.doesNotMatch(page, /item\.prices|Row total/);
  assert.doesNotMatch(orders, /prices:\s*\{/);
  assert.match(page, /Repeat eligible items/);
  assert.match(page, /Request a return/);
  assert.match(page, /css_employee/);
});
