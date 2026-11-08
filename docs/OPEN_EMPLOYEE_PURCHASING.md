# Open Employee Purchasing: Store integration

When a company administrator or CSS Staff enables the company setting in Magento, buyers already authorised
for checkout can choose any active Employee in their selected company. The
new `css_company_buyable_employees` Magento operation is purchase-only and
does not expose Employee edit/finance APIs; no new Store role checks or
customer-supplied manager IDs are introduced.

Existing basket, kit, delivery, purchase eligibility, credit approval,
PO, and native order placement contracts remain unchanged. The Employee
list now paginates through the Magento 200-item limit, with an explicit
50-page safety ceiling rather than returning an incomplete list.

The canonical backend must deploy first. Magento then enforces scope on
cart assignment and credit/native submission. The canonical backend allows only verified company administrators or CSS Staff
to change the setting. It defaults OFF everywhere.

**Controlled Employee delivery** is mutually incompatible with this
initial delegated-purchasing mode, because the mapping is owned by the
Employee's original manager's Magento customer account. Store fails
closed if both are enabled; Admin prevents that conflicting setting.
No manager address is copied, exposed or reused by a different buyer.

Focused smoke: (1) OFF manager-only, (2) ON existing buyer can select and
submit for another manager's active Employee using their own permitted
delivery address, (3) denied buyer/foreign company/inactive Employee,
(4) toggle OFF before submit rejects the delegated quote. Keep real
orders unsent until explicitly authorised.

## Reconnection for Magento 2.4.7 / 2.4.9

After Fluid #119 has been deployed and its Magento DB/schema verified, enable
the **Store server-only** rollout flag:

```
CSS_STORE_OPEN_EMPLOYEE_PURCHASING_ENABLED=1
```

The default is **0**. Until then Store retains the previously deployed
`css_company_employees` GraphQL operation and does not query the new field.
With the flag on, Store uses only `css_company_buyable_employees` for the
checkout-beneficiary list (regardless of whether an individual company's
Open setting is ON). Magento itself applies the company-scoped manager
filter when the company is OFF and the company-wide checkout-authorised scope
when the company is ON. The Store never falls back from a failing purchase-only
query to a potentially broader HR directory.

The purchase-only query intentionally exposes no employee company ID, role ID
or manager details. In the Employee-first journey, Store validates the chosen
Employee's real assigned role and buyer company with the existing customer-token
`css_effective_catalogue_products(employee_id)` resolver, then rechecks
beneficiary scope and native cart before the actual order action. In the
legacy journey Magento still enforces cart assignment and checkout.

The shipping page requests `open_employee_purchasing` only behind this flag
and fails closed if that setting conflicts with Controlled Employee delivery.
The feature does **not** add a new customer-token ability to edit Employees,
purchase controls, addresses or approval settings.

### Safe order of activation
1. Verify Fluid #119 code, column and query on **Demo 2.4.9/OpenSearch** and
   independently on **Live 2.4.7/Elasticsearch 7**. Use a real checkout-right
   buyer customer token, not a Magento admin token.
2. Merge/deploy CSS Admin's compatible setting UI, initially flag OFF, then
   enable `CSS_ADMIN_OPEN_EMPLOYEE_PURCHASING_ENABLED=1` on the qualified
   Admin deployment. Keep each company's Open flag OFF.
3. Merge/deploy Store with its new flag OFF; then enable the flag only for
   the Store deployment pointing at that qualified Magento. This does not
   change any company entitlement.
4. Opt in **one company without Controlled Employee delivery**, then use two
   authentic Magento buyers for a non-submitting smoke. The second buyer can
   select another manager's active beneficiary but cannot edit them.
5. Revoke the company switch and verify cross-manager selection/checkout
   are denied on the next request. Test credit/native checkout as a
   non-submitting preview; do not place production orders.

No new Cron, PostgreSQL employee assignment, catalogue index, migration or
Fluid implementation is necessary in this Store PR.
