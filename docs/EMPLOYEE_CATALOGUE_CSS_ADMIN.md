# CSS Store Employee-first purchasing — existing Magento/Fluid backend

**Status: code-only; Store mode OFF by default.**
No Fluid or Magento code changes or deployments are permitted for this
workstream. CSS Admin owns the new optional read model in its existing
PostgreSQL database; it does not own authentication or checkout.

## User journeys

- Employees OFF: **unchanged** login → normal catalogue → basket → checkout.
- Employees ON / Employee Catalogue OFF: **unchanged** manager buying and
  employee assignment at checkout.
- Employees ON / opted-in Employee Catalogue ON: Manager logs in →
  selects a Magento-authorised, manager-scoped Employee → sees the
  Employee's *Catalogue Role* products/categories (intersected with the
  manager's existing Magento catalogue permission ceiling) → uses the
  existing Magento basket, Employee attribution and checkout.

Catalogue Restrictions and Purchase Controls are separate. The first
determines visible products. The Employee's already-applied Purchase
Controls remain Magento's authority for quantities, periods, approvals,
PO requirements and ordering. The buyer is never impersonated as the
Employee or granted any new Magento permissions.

## Scoped source

Existing CSS Admin PostgreSQL on port 5432 holds the separately assigned
employee Catalogue Role and a bounded immutable role-products capture
from Magento's existing \`css_admin_role_catalog_policy\` GraphQL.
A different Employee may have a different Catalogue Role even when two
employees inherit the same purchasing controls.

CSS Store requires a \`READY\` \`css_admin.read_employee_role_catalogue_v2\`
response with source contract
\`MAGENTO_ROLE_CATALOGUE_VISIBILITY_V2\`, exact product IDs and SKUs,
and a non-expired snapshot tied to the *current assignment revision*.
The obsolete allowance-based reader is rejected and its grant revoked
by the separate new migration.

The reader uses an existing dedicated Execute-only Store role and a
private signing key, never the CSS Admin writer. The opted-in Store mode
requires both environment values:
\`CSS_STORE_EMPLOYEE_CATALOGUE_ENABLED=1\` and
\`CSS_STORE_EMPLOYEE_CATALOGUE_SOURCE=ROLE_CATALOGUE_V2\`.
Both are OFF or absent by default.

Within this new mode, Store filters SKUs **inside Magento GraphQL**
before pagination, checks PDP and cart writes, and validates the actual
Magento cart and per-Employee role membership before both credit and
native checkout. Successful single-Employee product additions attach the
preselected Employee to the Magento cart; checkout displays the
selection rather than requiring it again. Multi-Employee baskets retain
per-line assignments. Bulk repeat-to-cart remains unavailable only
in this optional mode until a pre-write validator covers it.

## Release holds

1. Merge and deploy the **Admin/Store live Magento compatibility**
   corrections, with both new switches OFF. Validate ordinary employee
   and standard purchasing; no Fluid deployment.
2. Separately approve and apply CSS Admin's additive
   \`007_employee_role_catalogue_v2.sql\` migration to **css_admin:5432**.
   Do not update another app's database.
3. Set Admin V2 switch for an attended pilot. Explicitly assign the
   Employee's **Catalogue Role** (not Purchase Role), capture its actual
   role products and verify exact source IDs/SKUs and DB readback.
4. Separately approve the dedicated V2 reader grant; verify raw table
   SELECT is denied and old allowance-based reader EXECUTE is revoked.
5. Only after continued freshness is proven (each capture lasts up to
   eight minutes, never past UTC midnight), enable Store V2 for a pilot
   and exercise standard login, role changes, expired capture, denied
   product, parent/grouped SKU, cart attribution, purchasing allowances,
   PO/approval and non-submitting native/credit checkout.

This Store filter is not a universal Magento catalogue ACL; any direct
Magento client still has its independent authenticated permissions.
Live activation needs a continuous, independently accepted capture
process. No new timer, schema write or live order is included here.
