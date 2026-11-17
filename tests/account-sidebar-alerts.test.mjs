import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

class MagentoGraphQLError extends Error {
  constructor(message, category = "graphql-authorization") {
    super(message);
    this.category = category;
  }
}

function creditFixture(answer) {
  const calls = [];
  const api = loadTypeScript(root, "lib/magento/credit-orders.ts", {
    "@/lib/magento/client": {
      MagentoGraphQLError,
      magentoGraphQL: async (query, variables, token) => {
        calls.push({ query, variables, token });
        if (answer instanceof Error) throw answer;
        return { css_credit_orders: { total_count: answer } };
      },
    },
  });
  return { api, calls };
}

test("approval count uses the exact authorised Magento queue total", async () => {
  const { api, calls } = creditFixture(7);
  assert.equal(await api.getCreditOrderScopeCount("token-A", "APPROVAL"), 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].variables.scope, "APPROVAL");
  assert.match(calls[0].query, /query StoreCreditOrderScopeProbe/);
  assert.match(calls[0].query, /total_count/);
  assert.equal(calls[0].token, "token-A");
});

test("PO-only clerk count uses approved missing-PO scope, not approval scope", async () => {
  const { api, calls } = creditFixture(3);
  assert.equal(await api.getCreditOrderScopeCount("token-B", "PO"), 3);
  assert.equal(calls[0].variables.scope, "PO");
});

test("zero authorised pending orders stays a visible queue with no numbered badge", async () => {
  const { api } = creditFixture(0);
  assert.equal(await api.getCreditOrderScopeCount("token-B", "PO"), 0);
  assert.equal(await api.canUseCreditOrderScope("token-B", "PO"), true);
});

test("forbidden approval queue is null, not a zero count or session logout", async () => {
  const { api } = creditFixture(new MagentoGraphQLError("Not authorised"));
  assert.equal(await api.getCreditOrderScopeCount("token-B", "APPROVAL"), null);
  assert.equal(await api.canUseCreditOrderScope("token-B", "APPROVAL"), false);
});

test("unexpected credit-order GraphQL errors remain visible, never disguised as no access", async () => {
  const { api } = creditFixture(new MagentoGraphQLError("Magento unavailable", "graphql-input"));
  await assert.rejects(
    () => api.getCreditOrderScopeCount("token", "PO"),
    (error) => error.category === "graphql-input",
  );
});

function salesFixture(answer) {
  const calls = [];
  const api = loadTypeScript(root, "lib/magento/orders.ts", {
    "@/lib/magento/client": {
      MagentoGraphQLError,
      magentoGraphQL: async (query, variables, token) => {
        calls.push({ query, variables, token });
        if (answer instanceof Error) throw answer;
        return { css_company_orders: { items: answer ? [{ order_date: answer }] : [] } };
      },
    },
  });
  return { api, calls };
}

test("latest sales-order signal is a lightweight, role-filtered one-order query", async () => {
  const { api, calls } = salesFixture("17/11/2026 14:00:00");
  assert.equal(await api.getLatestCompanyOrderDate("token"), "17/11/2026 14:00:00");
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /css_company_orders\(currentPage: 1, pageSize: 1\)/);
  assert.match(calls[0].query, /items \{ order_date \}/);
  assert.doesNotMatch(calls[0].query, /quantity_ordered|css_company_orders\(currentPage: \$currentPage/);
});

test("no permitted sales history or temporary Magento error hides optional badge only", async () => {
  const { api } = salesFixture(new MagentoGraphQLError("Denied"));
  assert.equal(await api.getLatestCompanyOrderDate("token"), null);
  const empty = salesFixture(null);
  assert.equal(await empty.api.getLatestCompanyOrderDate("token"), null);
});

test("New only means a sales order placed on the current UK calendar day", () => {
  const { api } = salesFixture(null);
  const now = new Date("2026-11-17T14:16:00Z");
  assert.equal(api.hasCompanyOrderPlacedToday("17/11/2026 10:02:00", now), true);
  assert.equal(api.hasCompanyOrderPlacedToday("16/11/2026 23:59:59", now), false);
  assert.equal(api.hasCompanyOrderPlacedToday("17/11/2025 10:02:00", now), false);
  assert.equal(api.hasCompanyOrderPlacedToday(null, now), false);
  assert.equal(api.hasCompanyOrderPlacedToday("bad timestamp", now), false);
});

test("sidebar badge UI is confined to authorised queues and Order history", () => {
  const component = source("components/account-sidebar.tsx");
  const layout = source("app/account/layout.tsx");
  const styles = source("app/account-sidebar.css");
  assert.match(layout, /getCreditOrderScopeCount\(token, "APPROVAL"\)/);
  assert.match(layout, /getCreditOrderScopeCount\(token, "PO"\)/);
  assert.match(layout, /getLatestCompanyOrderDate\(token\)/);
  assert.match(layout, /showApprovals=\{approvalCount !== null\}/);
  assert.match(layout, /showPoNumbers=\{poCount !== null\}/);
  assert.match(component, /\{showApprovals \? <SidebarLink/);
  assert.match(component, /\{showPoNumbers \? <SidebarLink/);
  assert.match(component, /pending > 0 \? <span/);
  assert.match(component, /pending > 99 \? "99\+" : pending/);
  assert.match(component, /recentToday \? <span/);
  assert.match(styles, /\.account-sidebar-alert-count-approval/);
  assert.match(styles, /\.account-sidebar-alert-count-po/);
  assert.match(styles, /\.account-sidebar-alert-recent/);
});


test("successful and partial-failure credit transitions refresh live account badges", () => {
  const actions = source("app/account/credit-orders/actions.ts");
  assert.match(actions, /import \{ revalidatePath \} from "next\/cache"/);
  assert.match(actions, /lifecycleMutationAttempted = true/);
  assert.match(actions, /poMutationAttempted = true/);
  assert.match(actions, /if \(lifecycleMutationAttempted\) revalidatePath\("\/account", "layout"\)/);
  assert.match(actions, /if \(poMutationAttempted\) revalidatePath\("\/account", "layout"\)/);
});
