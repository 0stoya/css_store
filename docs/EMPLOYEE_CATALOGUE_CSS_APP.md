# Employee-first Store catalogue (css_app projection)

**Status: code-only, default OFF; do not deploy/activate without source and release gates.**
This PR is stacked on `css_store` Open Purchasing #96 and requires the accepted
Magento/Css Commerce open-purchasing schema/permissions (Fluid PR #119).
**No new Fluid changes.**

## Four modes, strict isolation

1. **Employee Ordering OFF:** unchanged email/password login, Magento catalogue,
   search, PDP, basket, shipping, purchase approvals and checkout. Zero new
   css_app reads; the feature's first gate returns before any Magento request.
2. Employees ON / Open Purchasing OFF: existing manager-scoped order flow,
   unaffected by this code.
3. Open Purchasing ON / global Store feature OFF: existing open purchasing
   behaviour; still no css_app dependency.
4. Open Purchasing ON / global Store feature ON: Employee selection before
   browsing; a signed HttpOnly cookie is scoped to authenticated Magento
   customer + selected company and expires after eight hours. Magento's
   existing company, active Employee, buyer checkout and catalogue ceilings
   still apply. An expired/missing/unqualified css_app employee policy **blocks
   only this new flow**, never standard purchasing.

The `css_app` source is the new immutable/expiring
`storefront.read_employee_catalogue_v1(bigint,bigint)` from Control #257.
Only its `READY` qualified 0–2000 SKU/ID snapshot is accepted. Empty means
**zero permitted products**, not all products. Store's dedicated connection
has execute-only access to that function, not Control tables or any writer
credential. Magento IDs are never Control catalogue product IDs.

Magento GraphQL `products` receives exact allowed SKUs via
`filter.sku.in` **before pagination** (including searches and categories).
PDP and add-to-cart enforce the selected SKU; cart reassignment and both
native and Fluid credit-order submission paths revalidate the actual Magento
cart against the employee's current qualified product IDs/SKUs and the current
active Employee membership. Grouped products use the canonical logical
parent ID when present; otherwise the exact Magento SKU must qualify.
No JavaScript browser trust or arbitrary company/employee ID grants.

Old bulk repeat-order/list additions are explicitly unavailable in this
mode until they can be verified before the cart write. Ordinary repeat
orders remain unchanged. Controlled Employee delivery remains mutually
exclusive with Open Purchasing as documented in #96/#155.

## Activation order / release holds

1. Merge/deploy Fluid #119 and its Magento schema/GraphQL; verify live.
2. Merge/deploy Admin #155 and Store #96, keeping Open Purchasing OFF.
3. Independently review/approve/install Control #257 migration and its
   execute-only reader grant, then capture and validate a complete current
   Magento applied-entitlement source receipt in the EXISTING css_app:55432.
   A continuously refreshed observed source is required before expiry.
4. In Store, configure a dedicated reader DSN and an independent, private
   `CSS_STORE_EMPLOYEE_CATALOGUE_SIGNING_KEY` (>=32 chars). Deploy with
   `CSS_STORE_EMPLOYEE_CATALOGUE_ENABLED=0`; do not enable until acceptance.
5. On one pilot company, confirm normal User login with Employees OFF still
   shows the identical catalogue, basket and checkout even if css_app is down;
   confirm Employee ON/Open OFF remains unchanged; confirm valid pilot
   Employee product and missing/expired/foreign-product denials; and complete
   one *non-submitting* credit/native checkout rehearsal. An actual live
   purchase requires explicit separate approval.

This Store-only enforcement is not an additional Magento API ACL: a customer
who has broader Magento catalogue rights could query Magento outside CSS Store.
This feature must not be represented as a universal backend embargo. It is
the enforced CSS Store journey, with Magento's native buyer+Employee hard
entitlements continuing to protect checkout. If true backend catalogue denial
independent of Store is required, Magento must enforce it.

No auto-deploy, production settings, SQL writes, role grants or real orders.
