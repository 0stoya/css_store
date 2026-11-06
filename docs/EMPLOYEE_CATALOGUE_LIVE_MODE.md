# Native Magento Employee Role catalogue — CSS Store

Status: **implementation PR, OFF by default; not production-accepted**.

## Canonical journey

Manager logs in with their normal Magento customer credentials; existing
`css_company_employee_configuration.uses_employee` determines whether the
company uses Employee ordering. The existing
`css_company_employees(active:true)` query determines which Employees are
visible to the authenticated user. Magento's separate cart-assignment and
checkout rules still determine who the user may **purchase for**; visibility
alone is not purchasing authority. An Employee is NOT impersonated.

Each native `CssCompanyEmployee.purchase_control_role_id` is an actual
Magento company role. When an Employee is selected, Store resolves that
Employee's CURRENT native role and reads the CURRENT
`css_company_role_catalog_policy(role_id,page)` with the same logged-in
buyer's Magento GraphQL token. There is NO second Employee-to-Catalogue
Role assignment in CSS Admin.

- Role without saved catalogue restrictions: the Employee inherits the
  authenticated buyer's Magento company catalogue; never an empty-string SKU
  grant and never a fallback on source error.
- Restricted role: walk every page of the live role product grid and use
  only the `allowed` items, validating role/company identifiers, category
  metadata, pagination and final first-page readback. False/empty results
  never silently become unrestricted.
- Use the exact allowed SKUs within the Magento product query BEFORE paging;
  the manager's Magento company/role ceiling continues to apply.
- Re-read the Employee and role on product add, cart reattribution, basket
  validation and credit/native checkout. Magento owns the cart, applied
  Purchase Controls, periods, approval, PO and order submission.

**Source of catalogue visibility:** Employee's Magento company role.
**Source of purchasing limits:** existing applied Employee Purchase Controls
in Magento. These are different policy domains even though the Employee
`purchase_control_role_id` is the common native role reference.

## Permission must-rule

The deployed Fluid `css_company_role_catalog_policy` resolver requires
`Fluid_UserRoleRestrictions::manage_catalog_visibility`. Current Fluid also
uses this permission for *save* operations. Therefore this is a powerful
**manage** permission, NOT a read-only grant.

Business policy: every company buyer authorised to use Employee catalogue
shopping must have this resource. Verify Magento company roles confer it
before turning the Store mode on. The Store does NOT silently grant ACL
resources or bypass a denied Magento GraphQL call. Automatically granting
this permission to new Employee buyers is a SEPARATE Magento ACL change
and needs an explicit review of the associated editing rights. Merely
setting the Store feature flag does not grant it.

## Full-production activation boundary

`CSS_STORE_EMPLOYEE_CATALOGUE_ENABLED=1`
`CSS_STORE_EMPLOYEE_CATALOGUE_SOURCE=LIVE_MAGENTO_ROLE`

Requires a private signed-selection cookie secret. When the feature is OFF,
ordinary Magento browsing, standard Employee selection and checkout remain
unchanged. When ON, all companies with Magento `uses_employee=true`
use the native journey, not a hard-coded company pilot list.

The existing Magento role grid returns **50 products per page**. This first
native implementation bounds reads to 200 pages / 10,000 source products,
with no truncation or fallback. Very large restricted roles must be measured
before global activation; if any exceeds this bound or Magento cannot
handle the resulting SKU filter reliably, activation is HOLD pending a
Magento-native role-filtered products resolver. Unrestricted roles use
normal Magento queries without a SKU list.

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

- Verify the live permission resource for a real Employee-capable manager
  and company administrator; denied permission must not silently fall back.
- Verify one restricted and one unrestricted real role, plus biggest assigned
  restricted role in the company; compare Magento SKU membership.
- Reassign an Employee's Purchase Role and edit role restrictions; the next
  Store request must show new policy without waiting for a timer.
- Deactivate and cross-company-check the selected Employee.
- Check grouped/parent SKUs, native and credit checkout and PO/approval.
- With flag OFF, regular purchasing is unchanged.
- Confirm Store deployment SHA and live Magento GraphQL schema first.

No production writes, schema migration, Fluid deployment or timed job are
performed by this code-only PR.
