import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

class MagentoGraphQLError extends Error {}

function fixture(counts) {
  const calls = [];
  const subject = loadTypeScript(root, "lib/magento/account-action-attention.ts", {
    "@/lib/magento/client": { MagentoGraphQLError },
    "@/lib/magento/credit-orders": {
      getCreditOrderScopeCount: async (token, scope) => {
        calls.push({ token, scope });
        const value = counts[scope];
        if (value instanceof Error) throw value;
        return value;
      },
    },
  });
  return { subject, calls };
}

test("the PO-only role gets an Account pulse when its own company has a pending PO", async () => {
  const { subject, calls } = fixture({ APPROVAL: null, PO: 1 });
  assert.equal(await subject.hasPendingAccountActions("clerk"), true);
  assert.deepEqual(calls.map(c => c.scope).sort(), ["APPROVAL", "PO"]);
  assert.ok(calls.every(c => c.token === "clerk"));
});

test("approvers see a pending-action pulse without needing PO-clerk permissions", async () => {
  const { subject } = fixture({ APPROVAL: 2, PO: null });
  assert.equal(await subject.hasPendingAccountActions("approver"), true);
});

test("neither no pending orders nor missing queue permissions generates a pulse", async () => {
  assert.equal(await fixture({ APPROVAL: 0, PO: 0 }).subject.hasPendingAccountActions("token"), false);
  assert.equal(await fixture({ APPROVAL: null, PO: null }).subject.hasPendingAccountActions("token"), false);
});

test("an unavailable optional Magento scope query does not block the Store", async () => {
  const { subject } = fixture({ APPROVAL: new MagentoGraphQLError("Unavailable"), PO: null });
  assert.equal(await subject.hasPendingAccountActions("token"), false);
});

test("unexpected programming errors still propagate", async () => {
  const { subject } = fixture({ APPROVAL: new Error("unexpected"), PO: null });
  await assert.rejects(() => subject.hasPendingAccountActions("token"), /unexpected/);
});

test("only authenticated Store headers fetch attention and Account reuses already loaded counts", () => {
  const nav = read("components/site-header.tsx");
  const indicator = read("components/account-action-attention.tsx");
  const layout = read("app/account/layout.tsx");
  const css = read("app/account-sidebar.css");

  assert.match(nav, /customerName \? <Link className="store-nav-link" href="\/account"/);
  assert.match(nav, /AccountActionAttention knownPending=\{hasPendingAccountActions\}/);
  assert.match(nav, /<Suspense fallback=\{null\}>/);
  assert.match(indicator, /knownPending\?: boolean/);
  assert.match(indicator, /if \(pending === undefined\)/);
  assert.match(indicator, /getCustomerToken\(\)/);
  assert.match(indicator, /if \(!pending\) return null/);
  assert.match(indicator, /aria-hidden="true"/);
  assert.match(layout, /hasPendingAccountActions=\{\(approvalCount \?\? 0\) > 0 \|\| \(poCount \?\? 0\) > 0\}/);
  assert.match(css, /account-action-attention::after/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
});

test("Account pages have smaller headings and no redundant explanatory paragraphs", () => {
  const queue = read("app/account/credit-orders/page.tsx");
  const detail = read("app/account/credit-orders/[number]/page.tsx");
  const orders = read("app/account/orders/page.tsx");
  const pageCss = read("app/account-sidebar.css");
  const detailCss = read("app/account/credit-orders/credit-orders.module.css");

  assert.match(queue, /<h1>\{isApprovalQueue \? "Order approvals" : isPoQueue \? "Awaiting PO numbers"/);
  assert.doesNotMatch(queue, /Purchases approved by managers, awaiting their official PO reference/);
  assert.doesNotMatch(queue, /Track credit orders from approval through to sales order/);
  assert.doesNotMatch(orders, /Orders available to you across/);
  assert.doesNotMatch(detail, /Status, fulfilment and activity for this credit order/);
  assert.match(detail, /\{messages\.error && !staleConversionError \? <p className="error"/);
  assert.match(queue, /\{result\.total_count\}/);
  assert.match(pageCss, /font-size: clamp\(1\.55rem, 2\.4vw, 2rem\)/);
  assert.match(detailCss, /\.detailHeader :global\(\.portal-page-heading\) h1/);
});

test("queue rows retain important statuses and PO entry actions without redundant badges", () => {
  const queue = read("app/account/credit-orders/page.tsx");
  assert.match(queue, /isPoQueue \? "PO number required"/);
  assert.match(queue, /isPoQueue \? "Enter PO number" : "View details"/);
  assert.match(queue, /!isPoQueue && actions\.length/);
  assert.match(queue, /isPoQueue \? <span className=\{styles\.softBadge\}>Purchase approved/);
});
