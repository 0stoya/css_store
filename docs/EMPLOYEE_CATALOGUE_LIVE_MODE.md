# Live Magento-compatible Employee-first purchasing

Deployed Magento does **not** expose `open_employee_purchasing` or
`css_company_buyable_employees`. No Fluid deployment is planned.

The existing manager-scoped `css_company_employees(active:true)` GraphQL
read is used again, with pagination (200/page). A manager can select only
an Employee Magento exposes in that manager's existing scope.

The Store's new Employee-first journey is opt-in and remains OFF unless
both `CSS_STORE_EMPLOYEE_CATALOGUE_ENABLED=1` and
`CSS_STORE_EMPLOYEE_CATALOGUE_SOURCE=ROLE_CATALOGUE_V2`.
Employee Ordering OFF keeps the original login, catalogue and checkout.
Neither the old `MAGENTO_APPLIED_EMPLOYEE_ALLOWANCES_GRAPHQL_V1`
projection nor Purchase Controls may be used as a Catalogue allowlist.

Catalogue Restrictions and Purchase Controls remain independent:
browse visibility must come from a qualified Employee Catalogue Role,
while Magento's existing applied Purchase Controls continue to validate
limits and approval at checkout.

No DB writes, new production settings, Magento changes or automatic
activation are part of this compatibility PR.
