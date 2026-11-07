# Native Magento Employee Role catalogue — CSS Store

Status: **fast Magento reader Store integration — demo acceptance pending; production remains gated**.

## Canonical journey

Manager logs in with their normal Magento customer credentials; existing
`css_company_employee_configuration.uses_employee` determines whether the
company uses Employee ordering. The existing
`css_company_employees(active:true)` query determines which Employees the
authenticated user is permitted to select. An Employee is NOT impersonated.

Each native `CssCompanyEmployee.purchase_control_role_id` is an actual
Magento company role. When an Employee is selected, Store resolves that
Employee's CURRENT native role using the read-only Magento `css_effective_catalogue_products(employee_id)` query with the same logged-in buyer's customer token. Magento verifies the buyer's selected company, Employee purchase eligibility and Purchase Role. There is no browser-supplied role/company ID. There is NO second Employee-to-Catalogue
Role assignment in CSS Admin.

- The headless Store **ignores Hyva category restrictions**. Those belong to
  the Magento/Hyva frontend; category selections are neither required for,
  nor allowed to override, independent role-product visibility.
- Role with **no saved product restrictions**: verified
  `preselect_all_products=true`, `products.preselect_all=true`, zero saved
  role-product IDs/count, and a consistent initial product grid. The Employee
  inherits the authenticated buyer's Magento company catalogue. No role SKU
  list is enumerated; this also works for large unrestricted company catalogues.
- Role with **saved product restrictions**: verify the Magento-authorised effective IDs/SKUs directly. Native grouped-product inheritance may reduce the effective product set compared with selected child IDs; e.g. demo Role #83 has 22 selected IDs and 17 effective IDs. The Store rejects malformed, mismatched, duplicate or oversized responses and never silently broadens to unrestricted.
- Use the exact allowed SKUs within the Magento product query BEFORE paging;
  the manager's Magento company/role ceiling continues to apply.
- The selection POST verifies active Employee/company/assigned role and
  signs only a beneficiary preference. The following catalogue page performs
  **one scoped live Magento role-product read** before showing products.
  If it fails, the shopper is returned to the Employee chooser with a safe
  error; the signed cookie alone never permits product browsing or a cart
  mutation.
- Restricted roles are returned as verified Magento effective IDs/SKUs in one GraphQL query; the old 50-per-page company grid walk and manager catalogue-edit ACL requirement are removed. No cross-request role-product cache or scheduled refresh is introduced.
- Re-read the Employee and role on product add, cart reattribution, basket
  validation and credit/native checkout. Magento owns the cart, applied
  Purchase Controls, periods, approval, PO and order submission.

**Source of catalogue visibility:** Employee's Magento company role.
**Source of purchasing limits:** existing applied Employee Purchase Controls
in Magento. These are different policy domains even though the Employee
`purchase_control_role_id` is the common native role reference.

## Permission must-rule

The Store does **not** call the editable `css_company_role_catalog_policy` reader in Employee shopping anymore. Magento's `css_effective_catalogue_products(employee_id)` validates the logged-in buyer's company, active Employee, purchasing scope and assigned Purchase Role **without granting** `Fluid_UserRoleRestrictions::manage_catalog_visibility` to the manager. Product/cart/checkout gates remain live; this read does not make an admin impersonation or staff token into a Magento customer token.

## Full-production activation boundary

`CSS_STORE_EMPLOYEE_CATALOGUE_ENABLED=1`
`CSS_STORE_EMPLOYEE_CATALOGUE_SOURCE=LIVE_MAGENTO_ROLE`

Requires a private signed-selection cookie secret. When the feature is OFF,
ordinary Magento browsing, standard Employee selection and checkout remain
unchanged. When ON, all companies with Magento `uses_employee=true`
use the native journey, not a hard-coded company pilot list.

The new endpoint avoids a company-wide product grid regardless of the selected role's catalogue size. The Magento endpoint bounds its effective SKU list to 10,000; anything larger or inconsistent is rejected rather than truncated. Inherited company scopes return no enumerated SKU list.

## Retiring the old PostgreSQL catalogue path

No `CSS_STORE_EMPLOYEE_CATALOGUE_DATABASE_URL` is used. Remove that secret
from the eventual Store runtime after the native feature is accepted.
The former `lib/employee-catalogue-db.ts` reader is removed in this PR.
Do NOT delete the separately used Employee delivery-address database URL
or the `postgres` dependency; those serve a different function.

The historical CSS Admin `006`, `007`, `007b` migrations and immutable
capture evidence are not a new buying authority. Do not drop those tables
during rollout. Retire their UI/flags/read grants in a separate reviewed
Admin change, preserving history for audit. Admin directory PR #159 and its
6-hour timer are separate from this purchase journey and are NOT required.

## Minimum acceptance before enabling

- Verify an actual customer token for an Employee-capable manager (including Admin support app switch) can call `css_effective_catalogue_products(employee_id)` without catalogue-edit ACL; denied/unauthorised Employee must not silently fall back.
- Verify one restricted and one inherited role; demo Company #10 / manager #34 / Employee #10 / Role #83 expected 17 effective SKUs from 22 saved selections, including grouped parents 1462 and 1601.
- Reassign an Employee's Purchase Role and edit role restrictions; the next
  Store request must show new policy without waiting for a timer.
- Deactivate and cross-company-check the selected Employee.
- Check grouped/parent SKUs, native and credit checkout and PO/approval.
- With flag OFF, regular purchasing is unchanged.
- Confirm Store deployment SHA and live Magento GraphQL schema first.

No production writes, schema migration, Fluid deployment or timed job are
performed by this code-only PR.
