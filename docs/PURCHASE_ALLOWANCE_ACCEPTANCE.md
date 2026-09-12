# Buyer allowance visibility — app acceptance

This slice displays the existing Fluid cart quantity-allowance contract on `/basket` and `/checkout/payment`. It does not add money budgets, employee entitlements, hard caps or new backend business rules. The hardened Fluid #87 backend is the intended runtime baseline.

## Behaviour

The summary displays active allowance records using Magento's `allowed_quantity`, `purchased_quantity`, `remaining_quantity` and aggregated `requested_quantity`. Remaining is explicitly **before this basket**; the browser never subtracts or sums quantities to decide eligibility. Group/variant/Employee rows sharing a logical product get one allowance record. Numeric product IDs are requested only to match labels; the existing deprecated-but-supported Magento `ProductInterface.id` field is aliased as `allowance_product_id` to match Fluid's numeric IDs. Unknown label mappings use an honest product-ID fallback, never positional matching.

Approval warnings are driven **only by the overall `approval_status`**. Fluid currently evaluates product allowances independently of the effective approval type and does not expose that type on the cart. Consequently, recorded allowances are labelled informational rather than being advertised as the cause of every approval decision. An overall ALLOWED basket never gets an excess warning solely because a per-product diagnostic says APPROVAL_REQUIRED. A value/all rule can require approval with no active allowance at all; this shows a generic company-approval notice, not fabricated zero allowances. An allowed buyer without active records gets no allowance block. Active records are collapsed by default for an allowed basket.

The cart API does not expose allowance start/expiry dates or duration. This slice does not invent them or reproduce cron/date logic. Those fields remain available in the existing management app.

Payment labels distinguish “Submit order” (credit workflow, overall allowed) from “Submit for approval” (overall approval required). This is display text only: the existing server action still re-reads checkout context and uses the Fluid credit workflow whenever enabled. Native placement still requires an explicit fresh ALLOWED response. No quantity stepper maximum is replaced with an allowance and no route bypass is added.

Basket write mutations and lightweight header count reads remain unchanged. Checkout asks for allowance detail in its existing context request, not a second request. No PDP block is added.

## Automated checks

After installing the repository's existing dependencies:

```bash
node --test tests/purchase-allowance.test.mjs
yarn lint
yarn typecheck
yarn build
```

Tests compile production helpers, queries and the unchanged checkout server action using the installed TypeScript dependency. GraphQL/Next IO are explicit doubles. Coverage includes grouped records, malformed/missing data, fractional requested quantities, none/value/all-style overall decisions, exact backend quantities, query wiring, refreshed approval changes, native fail-closed behaviour and preservation of the credit-order route. They do not perform live checkout or replace browser/build acceptance.

## Required live acceptance

1. With an active template allowance of four and two previous purchases, add one unit: show 4 / 2 / 2 / 1, not a recalculated remaining of 1. With three units, show 4 / 2 / 2 / 3 and the backend overall approval message.
2. Split the controlled product across sizes and beneficiary Employees. The summary must use one logical-product record and the backend aggregate, while retaining ordinary basket quantities and Employee controls.
3. Use approval types none, value and all as well as template. Per-item diagnostics must never override an ALLOWED overall decision. Value/all approval with no active allowance must not be explained as exceeding a fabricated quantity limit.
4. Verify missing/expired rules, empty baskets, null eligibility and company switching. Unknown overall status must not look like permission to order. Native checkout remains blocked unless its fresh backend result is ALLOWED.
5. Change the allowance or consume it in another session between reviewing and submitting. Confirm checkout uses the refreshed decision. Verify both company-credit and another permitted payment method, including auto-approved credit orders.
6. Run the existing basket update/remove, Employee assignment, delivery, totals/discount, persistent header count and order-confirmation journeys. Test keyboard access to the disclosure and narrow viewport text wrapping.

## Existing open PR interaction

Store PR #23 proposes removing `css_purchase_eligibility` from the basket query because the old basket did not consume it. This slice now consumes it deliberately. Do not merge #23 unchanged afterwards: either retain this field or redesign this summary with an explicit authoritative read. This PR does not close or modify #23, and does not suppress resolver failures or remove checkout validation.

Full lint/typecheck/build and live Magento/browser acceptance must be recorded on the PR before merge.
