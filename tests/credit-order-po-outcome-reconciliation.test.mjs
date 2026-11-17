import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function form() {
  const data = new FormData();
  data.set("number", "000000012");
  data.set("purchase_order_number", "PO-012");
  data.set("from", "po");
  return data;
}

function fixture({ mutation, readback } = {}) {
  const paths = [];
  let reads = 0;
  const initial = { css_credit_order: {
    actions: { can_enter_po_number: true },
    status: "approved",
    order_id: null,
    order_number: null,
    logs: [],
  }};
  const actions = loadTypeScript(root, "app/account/credit-orders/actions.ts", {
    "next/cache": { revalidatePath: (...parts) => paths.push(parts) },
    "next/navigation": {
      redirect: (url) => {
        const error = new Error("Redirect");
        error.location = url;
        throw error;
      },
      unstable_rethrow: () => {},
    },
    "@/lib/magento/credit-orders": {
      getCreditOrder: async () => (++reads === 1 ? initial : readback),
      setCreditOrderPurchaseOrderNumber: async () => {
        if (mutation instanceof Error) throw mutation;
        return mutation;
      },
      addCreditOrderComment: async () => {},
      performCreditOrderAction: async () => {},
    },
    "@/lib/session": { requireCustomerToken: async () => "customer-token" },
  });
  return { actions, paths, reads: () => reads };
}

async function redirectTarget(promise) {
  try {
    await promise;
    assert.fail("Expected redirect");
  } catch (error) {
    assert.equal(error.message, "Redirect");
    return new URL(error.location, "https://store.example.test");
  }
}

test("PO mutation error followed by placed Magento order is reconciled as success", async () => {
  const { actions, paths, reads } = fixture({
    mutation: new Error("Approved quote #839 contains an item Magento cannot safely reload."),
    readback: { css_credit_order: {
      status: "order_placed", order_id: 158, order_number: "000000160", logs: [],
    }},
  });
  const url = await redirectTarget(actions.setCreditOrderPurchaseOrderNumberAction(form()));
  assert.equal(url.pathname, "/account/credit-orders");
  assert.equal(url.searchParams.get("scope"), "PO");
  assert.match(url.searchParams.get("notice"), /PO number saved.*Sales order 000000160 created/);
  assert.equal(url.searchParams.get("error"), null);
  assert.equal(reads(), 2);
  assert.deepEqual(paths, [["/account", "layout"]]);
});

test("failed synchronous placement with committed PO yields nonfinal confirmation, not a false error", async () => {
  const { actions } = fixture({
    mutation: new Error("Approved quote #839 contains an item Magento cannot safely reload."),
    readback: { css_credit_order: {
      status: "approved", order_id: null, order_number: null,
      logs: [{ activity_type: "set_purchase_order_number" }],
    }},
  });
  const url = await redirectTarget(actions.setCreditOrderPurchaseOrderNumberAction(form()));
  assert.equal(url.pathname, "/account/credit-orders");
  assert.match(url.searchParams.get("notice"), /PO number saved.*not yet confirmed/);
  assert.equal(url.searchParams.get("error"), null);
});

test("unconfirmed PO outcome never promises a created order or encourages immediate retry", async () => {
  const { actions } = fixture({
    mutation: new Error("internal Magento quote reload exception"),
    readback: { css_credit_order: {
      status: "approved", order_id: null, order_number: null, logs: [],
    }},
  });
  const url = await redirectTarget(actions.setCreditOrderPurchaseOrderNumberAction(form()));
  assert.equal(url.pathname, "/account/credit-orders/000000012");
  assert.equal(url.searchParams.get("from"), "po");
  assert.match(url.searchParams.get("error"), /outcome could not be confirmed.*before retrying/);
  assert.doesNotMatch(url.search, /internal%20Magento/);
});

test("successful PO mutation only claims placement when Magento returns linked order ID", async () => {
  const { actions } = fixture({
    mutation: { status: "approved", order_id: null, order_number: null },
  });
  const url = await redirectTarget(actions.setCreditOrderPurchaseOrderNumberAction(form()));
  assert.match(url.searchParams.get("notice"), /PO number saved.*not yet confirmed/);
  assert.doesNotMatch(url.searchParams.get("notice"), /Sales order created/);
});

test("completed sales order takes precedence over stale quote-conversion URL error, not unrelated errors", () => {
  const presentation = loadTypeScript(root, "app/account/credit-orders/presentation.ts");
  const error = "Approved quote #839 contains an item Magento cannot safely reload. Sales-order conversion is held for review.";
  assert.equal(presentation.isOutdatedCreditConversionError("order_placed", 158, error), true);
  assert.equal(presentation.isOutdatedCreditConversionError("approved", null, error), false);
  assert.equal(presentation.isOutdatedCreditConversionError("order_placed", 158, "Comment could not be saved."), false);
  const page = readFileSync(new URL("../app/account/credit-orders/[number]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /messages\\.error && !staleConversionError/);
  assert.match(page, /staleConversionError \\? <p className="success"/);
});
