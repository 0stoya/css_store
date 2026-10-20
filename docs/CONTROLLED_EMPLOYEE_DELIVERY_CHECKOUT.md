# Controlled Employee delivery — company opt-in Store checkout

## Contract

**Only** applies when both:
1. Magento/Fluid `css_company_employee_configuration.uses_employee=true`
   and `multi_employee_basket=false`; and
2. the selected Magento company has
   `css_admin.company_employee_delivery_policy.controlled_delivery_enabled=true`.

All other companies continue their existing Magento address-book checkout.
The setting is OFF by default and cannot be enabled in Admin without canonical
single-Employee ordering.

The company flag and owner-scoped Employee mapping are read from the
**existing** `CSS_STORE_EMPLOYEE_ADDRESS_DATABASE_URL` restricted connection.
A policy read error fails closed for single-Employee checkout: it must never
be misinterpreted as OFF. Never copy `CSS_ADMIN_DATABASE_URL` into Store.

## Behaviour when enabled

- Selecting an Employee checks the current Magento company ID, authenticated
  customer ID, active Employee, and current `(company_id, owner_customer_id,
  employee_id)` address mapping. An ID is valid only if the Magento address
  still belongs to that customer.
- The existing Magento `setShippingAddressesOnCart(customer_address_id)`
  first applies the mapped native destination. The Employee delivery review
  cookie **stays pending** until the recipient is entered.
- The delivery step shows **only the one mapped Magento location**, not all
  `customer.addresses`, and neither a normal saved-address alternative nor
  the new-address form.
- Buyer must enter the **actual recipient's name** (e.g. John Smith, not a
  beneficiary site record such as Currie & Brown Belfast).
- The Store server reconstructs the shipping address from Magento-owned
  saved-address fields, prepends `Attn: <recipient>` as order **street[0]**,
  keeps all original physical lines, sets `save_in_address_book=false`, and
  applies the ordinary native Magento `setShippingAddressesOnCart` mutation
  with its `CartAddressInput`. No saved customer address is edited.
- The cart is read back and checked for exact company/customer mapped ID,
  physical location and recipient before the review cookie can clear.
- **Billing** is set to the original saved Magento address by
  `setBillingAddressOnCart(customer_address_id)`, not copied from shipping,
  so `Attn:` does not appear on the invoice recipient street line.
- Both payment review and actual native/credit order submission perform a
  fresh server-side company-policy, Employee, manager-owner mapping,
  Magento-saved-address and recipient/cart-address check. Stale/missing/
  changed mappings and direct-posted unrestricted address actions fail closed.
- A change of Employee re-enters pending state; no previous shipping address
  is silently approved.

We do NOT create new Fluid GraphQL APIs or alter Magento's permanent saved
addresses. Existing regular Employee delivery behaviour remains unchanged
when the flag is OFF.

## Release order (no unreviewed production activation)

1. Accept Admin draft PR `0stoya/css_admin#148`, test, review migration 004,
   apply it to the actual `css_admin` Postgres database using the normal
   operator-governed DDL release.
2. Grant the existing Store SELECT-only account access to **only** the
   new policy table, in addition to migration 003's existing mapping table.
   Recheck that this account cannot insert, update, delete or CREATE.
3. Test Store and Admin at exact pinned PR SHAs in isolated scratch builds;
   do not copy production secrets. Run tests for controlled mode and existing
   address-lookup, checkout, billing and credit order paths.
4. Merge/deploy with policy OFF for all companies. Verify existing checkout
   parity for companies without single-Employee ordering and existing
   Employee companies with the policy OFF.
5. **Staged end-to-end validation with no real order submission**:
   - company CUR008/Belfast + CUR009/Birmingham; pick exact owned address;
   - correct assigned destination is the only one shown;
   - no mapping, deleted address, foreign customer, disabled Employee and
     company switch all block controlled checkout;
   - one actual person's recipient is required; first street line is
     `Attn: <name>`, physical street retained, `save_in_address_book=false`;
   - native Magento quote address fields and shipping/rates are retained;
   - Magento billing is the original customer saved address, excluding
     `Attn:`, and manual POST to other address actions is rejected;
   - confirm typical saved addresses with multiple street lines against
     actual Magento input validation, carrier labelling, and credit flow.
6. After acceptance, *separately* approve enabling the company flag for a
   first single-Employee company. No implicit flag activation by migrations
   or the application release.

### Focused server acceptance

`scripts/premerge-controlled-employee-delivery-store.sh` runs the source
and regression tests, TypeScript, lint, Next production build in a scratch
checkout, without changing the live PM2 process or accessing production
Magento/Postgres. Exact pins must be reviewed before release.

### Contract caveat

The new billing mutation and cart-only multi-line shipping address must be
confirmed with the site's **real Magento GraphQL** on the non-submitting
staging cart. Unit fixtures alone are not proof of production schema
compatibility, quote address retention or downstream invoice/label layout.
The setting stays **OFF** until those checks pass.
