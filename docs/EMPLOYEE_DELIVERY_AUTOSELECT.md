# Manager-owned Employee shipping address auto-selection

## Behaviour

This extends the existing checkout's Employee picker. It does not replace
Magento address storage, shipping calculations, or credit-order submission.

1. A manager assigns an existing Magento address to a beneficiary Employee
   in Admin's `/portal/employees` page.
2. In single-Employee checkout, the manager selects the Employee as normal.
3. The Store reads `(selected Magento company ID, authenticated customer ID,
   selected Employee ID)` from Admin's PostgreSQL mapping with a **SELECT-only**
   database connection. The current Employee must be active and visible via
   the existing Fluid-scoped employee listing.
4. The mapped address must still appear in this customer's native
   `customer.addresses`. Only then Store calls the already-used Magento
   `setShippingAddressesOnCart` mutation with `customer_address_id`.
5. Magento calculates available shipping methods and rates as today.

If no mapping exists, it belongs to another customer, it has been deleted,
or PostgreSQL is unavailable, Store leaves checkout in an explicit
**Confirm delivery address** state. A previous Employee's cart address is
not silently trusted. Selecting either a saved or a new delivery address
clears this state only after Magento's address write succeeds. The review
and final submit actions recheck this state server-side.

When the manager manually overrides the address for that order, later page
renders do not auto-apply the mapped address again. Selecting/changing the
Employee explicitly is what starts a new lookup. Multi-Employee baskets
keep their current one-destination-per-order flow and do not use this path.

## Deployment

First deploy Admin migration `003_employee_delivery_addresses.sql` and
verify that the portal mapping form and database owner-scope work.

Provision a dedicated PostgreSQL login with `CONNECT`, `USAGE` on the
`css_admin` schema and `SELECT` only on
`css_admin.employee_delivery_address_assignment`.

Set the **server-only** environment variable:

```env
CSS_STORE_EMPLOYEE_ADDRESS_DATABASE_URL=postgresql://css_store_employee_address_reader:REPLACE_ME@127.0.0.1:5432/css_admin
```

Do not copy the Admin database writer connection string to Store.
Do not expose this value through `NEXT_PUBLIC_*` or the browser.

Install dependencies and validate before any production activation:

```bash
yarn install
node --test tests/employee-delivery-address.test.mjs
node --test tests/purchase-allowance.test.mjs
yarn typecheck
yarn lint
yarn build
```

## Acceptance checks

- Manager with 10 own addresses and 10 active Employees maps Employee
  `1234` to Address `1000` in Admin. Selecting Employee `1234` in
  Store preselects Magento Address `1000`.
- Unassigned and deleted IDs prompt manual confirmation.
- User B cannot consume User A's saved address; also test cross-company
  scope and an Employee moved out of the manager's scope.
- Selecting a new Employee without mapping does not allow final order
  submission using the previous Employee's shipping destination until
  explicitly confirmed.
- A manual address override persists through payment and final order
  submission; shipping method remains valid for the actual destination.
- Existing credit-order and native checkout branches are unchanged.

This first slice covers **address-ID auto-selection**. The optional printed
delivery-name/attention line must be handled in a subsequent, tested
Magento quote/order mapping—do not rewrite the physical street or the
permanent Magento saved address to fake it.
