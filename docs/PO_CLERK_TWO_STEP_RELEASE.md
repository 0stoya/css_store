# PO clerk release — one approver, one PO-number issuer

## Agreed customer workflow

- **Buyer** submits a credit-order request. Magento/Fluid retains the credit-order grand total and quote.
- **Person A** approves or rejects the **purchase** under the existing company hierarchy/approval rules. Person A does *not* issue a PO number.
- **Person B** has one clerical responsibility: enter the official PO number generated in the customer's system. B **never rejects an approved purchase** and does not get any PO refusal action.
- Fluid creates the Magento sales order only after approval, valid PO entry, and all existing quote/payment/employee guards pass. For `approved_pending_payment`, the original buyer must still complete the required payment details.

Do not create a second approval stage, custom PO register, timer or database table.

## Company setup

Configure these in Magento company roles / headless Admin Users & Roles:

| Actor | Required permission | Must not get solely for this workflow |
|---|---|---|
| Buyer | Checkout / submit credit order | Enter PO Numbers; Auto-approve own orders |
| Person A | Approve/Reject Credit Orders, manager relationship as needed | Enter PO Numbers |
| Person B | Enter PO Numbers | Approve/Reject Credit Orders, Auto-approve own orders, Checkout / place orders |

If the company uses structure-based approval, assign Person A as the buyer's manager and set the buyer's approval rule to **All** for mandatory signoff. Check company admin exemptions and test a non-auto-approved order. Separate permissions are granted through existing company roles.

## Backend authority (Fluid #140)

- `css_credit_orders(scope: PO)`: company-wide only for `enter_po_numbers`, but only already-approved, unnumbered credit orders. Managers' approval queue continues to be hierarchy-based.
- `CssCreditOrderActions.can_enter_po_number`: authoritative eligibility for the current user and order. The Store UI must not infer it from `approved && !can_place_order`.
- `cssSetCreditOrderPurchaseOrderNumber` rechecks scope, status, missing PO, content, actor and approved quote state, then persists **live quote and snapshot** and logs acting company-user ID.
- Hyvä Missing PON POST and shared authorization are protected too: the PO-only role cannot approve, reject, cancel or manually place an order.
- Locking serialises concurrent number entry; an existing or conflicting reference cannot be overwritten by the clerk.
- Existing Fluid placement validator and employee eligibility remain authoritative. PO entry can immediately create a Magento sales order when the remainder is ready.

## Deployment order

1. Merge and deploy **Fluid #140** to the selected Magento environment and verify schema introspection of `PO` and `can_enter_po_number`. Do this **before** deploying Store, because the Store queries the new non-null action field.
2. Run PHP syntax checks, Magento DI compilation and focused PHPUnit in a demo/isolated environment. Source inspection is not a substitute.
3. Validate the existing approved/missing-PO Hyvä query and POST, plus the new headless queue and one approved test order.
4. Merge and deploy **Store #114**, then verify the customer-facing account sidebar, PO queue, amount, entry, and readback.
5. Keep rollback simple: Store first, Magento second; do not delete already-created Magento orders or PO numbers.

## Essential pilot scenarios (do not use a real PO)

- Buyer with no PO rights: submits, stays `approval_required` or `pending`, cannot enter official number.
- A manager: can approve/reject before approval; cannot issue a PO without separate permission.
- B with PO-only role: cannot see approval queue and has **no** Approve/Reject/Cancel/Place action even through Hyvä; can see the PO queue and approved grand total.
- Try PO action against pending, rejected, canceled, already-numbered, already-placed, and another-company credit order: all fail.
- Try invalid, overlong, empty, duplicated and concurrent entries: all fail or produce one uniquely accepted number.
- Try a mismatch between current live quote total and approved credit-order total: release is blocked and no PO entered.
- On an approved/ready pilot: issue one PO; confirm customer PO appears on Magento sales order and original credit-order snapshot, the activity ledger records the correct company-user actor, and only one Magento order is created (including with queued `creditorder.toorder`).
- On `approved_pending_payment`: PO entry does not bypass the original creator's required payment-details step.
- Verify all already-working native checkout, non-PO approvals and other companies are unaffected.

## Known follow-up / customer email routing

Magento's existing **Missing PON** reminder template still links to its Hyvä order page. The new headless `/account/credit-orders?scope=PO` queue works independently, but do not claim that reminder has been converted to a headless link. The headless customer-facing origin must be confirmed and configured before changing the email template; do not invent a URL.

**Release hold:** no real account/customer purchase or email was exercised while authoring these PRs.