# Employee-first purchasing catalogue — CSS Store + CSS Admin

**Status:** code available, feature OFF by default. No production
configuration, database migration or source refresh has been activated.

## Repositories

- `css_store` — browsing, Employee selection, basket and checkout guards.
- `css_admin` — current applied-allowance source captures, immutable
  observations and the separately granted PostgreSQL read function.
- `Fluid` — existing Magento Employee identities, catalogue ceilings,
  buyer permissions, applied allowances, payment and approvals. There is
  **no new Fluid modification** for this feature.

The Store's dedicated read-only connection uses
`CSS_STORE_EMPLOYEE_CATALOGUE_DATABASE_URL`, pointing to **CSS Admin's
existing PostgreSQL database**. It executes only
`css_admin.read_employee_catalogue_v1(bigint,bigint)`. Never use the CSS
Admin writer credential or an unrelated application's database.

## Four-mode compatibility

1. Employee Ordering OFF: normal email/password login, catalogue, PDP,
   basket, purchase controls, PO and checkout are unchanged. No new
   database lookup occurs.
2. Employee Ordering ON + Employee catalogue switch OFF: existing manager-restricted
   Employee purchasing is unchanged.
3. Employees ON + global Store catalogue switch OFF: existing Open
   Purchasing behaviour unchanged, with no new database dependency.
4. Employees ON + global Store catalogue switch ON: buyer
   selects an active Employee before browsing; Store applies a qualified
   Employee SKU filter **inside Magento GraphQL, before pagination**, and
   revalidates product selection, cart attribution and native/credit-order
   submission. Magento's buyer permissions, pricing, allowances and
   approvals remain authoritative.

A `READY` source is limited to 2,000 explicit Magento IDs and SKUs.
A qualified empty source means zero products, never unrestricted browsing.
Missing/expired/invalid source fails closed only in the new opt-in mode.
The signed HttpOnly selection cookie is bound to Magento's authenticated
buyer and selected company.

A Store guard cannot become a universal Magento ACL: other Magento clients
can still exercise their own authenticated permissions. Existing Employee
hard entitlement checks continue to protect actual Magento submission.
Bulk repeat-order additions are deliberately unavailable in Employee
Catalogue mode until a pre-write entitlement guard can cover them.

## Safe deployment sequence

1. Verify existing Fluid Open Purchasing functionality in Magento and
   complete CSS Admin company-setting changes before enabling it for customers.
2. Review and explicitly install CSS Admin's Employee Catalogue PostgreSQL
   migration; provision a separate read-only Store role and grant only
   EXECUTE on the read function.
3. Enable Staff capture **only** for a named pilot Employee; independently
   verify its Magento applied allowance, SKU mapping and database readback.
   Manual Staff refresh is not a substitute for continuous freshness.
4. Configure the Store reader DSN and an independently generated
   `CSS_STORE_EMPLOYEE_CATALOGUE_SIGNING_KEY` (minimum 32 characters).
   Deploy with `CSS_STORE_EMPLOYEE_CATALOGUE_ENABLED=0`.
5. Verify standard purchasing with Employees OFF, manager-only purchasing,
   the pilot Employee catalogue, stale-source refusal and native/credit
   non-submitting checkouts. Keep the feature OFF until a recurring refresh
   mechanism has been accepted for each enabled pilot company.

No default enablement, production grant, data import, timer or actual order
is authorised by this source change.
