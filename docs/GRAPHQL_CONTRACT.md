# Storefront GraphQL contract map

This document maps the accepted Magento / Fluid GraphQL surface to `css_store` features.

It is a developer guide, not a replacement for schema introspection. The authoritative CSS schema is `0stoya/Fluid/Css/Commerce/etc/schema.graphqls`, and native Magento fields must always be checked against the deployed Magento version.

## Contract rules

- `css_store` uses **customer** GraphQL only.
- Never call `css_admin_*` operations from the storefront.
- Never call OGL directly.
- Prefer native Magento operations when they correctly model the capability.
- Use CSS/Fluid operations where company scope, employee attribution, purchase controls, credit orders, returns or compatibility require them.
- Treat all customer/company/cart/order IDs as untrusted inputs until the backend validates them.

---

## Authentication and customer context

### Native Magento

- `generateCustomerToken`
- `revokeCustomerToken`
- `customer`

### CSS / Fluid

- `css_company_context`
- `cssSelectCompany(company_id: Int)`

### Storefront use

Login creates a Magento customer token, verifies it by querying `customer` plus `css_company_context`, and only then stores it in the HttpOnly storefront session.

The selected Fluid company controls the customer-specific commercial context for later queries.

---

## Storefront presentation and ordering capability

### CSS / Fluid

- `css_storefront_policy`
- `css_ordering_capabilities`

`css_storefront_policy` currently exposes the accepted price/add-to-cart presentation policy including:

- `authenticated`
- `hide_price`
- `hide_add_to_cart`
- `add_to_cart_label`

`css_ordering_capabilities` is the authoritative summary for company/order behaviour. Phase 3 should query the exact deployed fields it needs rather than hardcoding business decisions in the frontend.

The accepted checkout/kiosk journey has already exercised capability fields including company context/activity, normal checkout availability, credit-order submission and auto-approval availability.

---

## Catalogue and search

### Native Magento

- `categories`
- `products`
- normal Magento product interfaces, prices, stock, image/media and configurable option data

### CSS / Fluid behaviour

The selected company/customer context influences catalogue visibility and commercial behaviour through Magento/Fluid compatibility. No separate browser-to-OGL price lookup is permitted.

### Storefront use

Phase 2 should support:

- category navigation;
- category product listing;
- Magento full-text product search;
- PDP by a stable Magento identifier/URL strategy;
- final company-context price;
- stock status;
- grouped/configurable structure;
- quantity/purchase-control information exposed by the deployed schema.

Do not copy a kiosk-specific category-root UID into the storefront. Resolve/confirm the actual store category hierarchy.

---

## Cart

### Native Magento

The accepted customer/kiosk implementation already uses:

- `customerCart`
- `addProductsToCart`
- `updateCartItems`
- `removeItemFromCart`

Typical fields consumed include:

- cart ID;
- total quantity;
- item UID;
- quantity;
- product SKU/name/stock/image;
- item price and row total;
- subtotal/grand total;
- shipping/payment state during checkout.

### CSS / Fluid grouped/configurable add

- `cssAddGroupedConfigurableProductsToCart`

Use this accepted compatibility mutation for the Fluid grouped/configurable workflow rather than attempting to reconstruct legacy kit behaviour from native Magento writes alone.

The current schema accepts canonical `employee_id` on this flow in addition to legacy employee-name compatibility.

### Employee assignment

- `cssAssignCartEmployee(cart_id: String!, employee_id: Int!)`
- `cssAssignCartItemEmployee(cart_id: String!, item_uid: ID!, employee_id: Int!)`

Use basket-wide assignment for single-Employee mode/reassignment and line assignment for multi-Employee mode.

The backend validates company scope, Employee activity and single/multi-basket policy.

### Cart compatibility fields

`Css_Commerce` also exposes cart-level compatibility for purchase eligibility, company credit and company discount. Use the exact deployed schema fields when implementing Phase 3; do not calculate allowances/credit/discount from unrelated frontend data.

---

## Employee / beneficiary queries

### CSS / Fluid

- `css_company_employee_configuration`
- `css_company_employees(currentPage, pageSize, search, active)`
- `css_company_employee(employee_id)`

The storefront normally needs configuration + active Employee listing for ordering.

Management/reporting operations also exist in the customer-company contract, but `css_store` should expose them only if there is a real customer-account requirement. Do not automatically recreate the Admin/portal Employee management UI in the shopping storefront.

### Core semantics

- Employees are non-login beneficiaries.
- Browser submits `employee_id`.
- Name/code are backend-derived canonical data.
- Inactive Employees cannot be newly assigned.
- Historical order snapshots remain readable after Employee changes/deactivation.

---

## Shipping

### Native Magento

The accepted customer checkout path uses:

- `setShippingAddressesOnCart`
- `available_shipping_methods` from the resulting/current cart
- `setShippingMethodsOnCart`

### Storefront rule

Render the available methods Magento returns for the current address/cart/company. Do not hardcode the kiosk `csslocker/locker` method into normal storefront checkout.

Address/customer-address GraphQL should be selected according to the agreed Phase 3 delivery UX and the deployed Magento schema.

---

## Payments

### Native Magento

- `customerCart.available_payment_methods`
- `setPaymentMethodOnCart`

### CSS / Fluid

- `css_ordering_capabilities`
- company-credit/cart compatibility fields in the deployed schema

### Storefront rule

Render backend-provided payment methods dynamically.

The kiosk currently uses `companycredit` for its specific flow; that is **not** a general storefront rule. A customer may have different valid payment methods depending on Magento/company configuration.

---

## Ordinary order placement

### Native Magento

- `placeOrder`

Use native Magento `placeOrder` only for a cart whose backend capabilities/business state permits ordinary checkout.

Re-read cart/payment/shipping/capabilities before final submit rather than relying on stale page state.

---

## Credit orders

### CSS / Fluid queries

- `css_credit_orders`
- `css_credit_order(number: String!)`

### CSS / Fluid mutations

- `cssSubmitCreditOrder`
- `cssApproveCreditOrder`
- rejection/cancellation/comment lifecycle mutations exposed in the authoritative CSS schema
- `cssAddCreditOrderComment`

Fluid also contains approved-payment-resume compatibility for `approved_pending_payment`, but that lifecycle state is not in the current launch UI because the configured business process does not currently create it.

### Storefront rule

Never bypass an approval-required credit order by calling `placeOrder` directly.

The detail/action response should drive which lifecycle actions are rendered for the current company user.

---

## Company order history

### CSS / Fluid

- `css_company_orders(currentPage, pageSize)`

This is the preferred company-aware order-history boundary because it applies Fluid order-visibility permissions for the selected company.

Order detail may also use the appropriate native/customer order surface where required, but visibility must remain consistent with the CSS company contract.

---

## Repeat order

### CSS / Fluid

- `css_repeat_order_lists`
- `cssRepeatGroupedConfigurableOrder`
- repeat-order list create/update/delete mutations exposed in the authoritative CSS schema

The compatibility layer preserves grouped/configurable structure and Employee metadata for old/new orders.

Storefront must surface skipped/reassignment conditions rather than silently substituting products or inactive Employees.

---

## Returns

### CSS / Fluid

- `css_returns_configuration`
- `cssSubmitReturnRequest`

The accepted return contract is a request/contact submission path backed by the existing `Css_Returns` repository and queue/email side effect.

Do not design screens for return history, RMA status, return-item eligibility or reason catalogs unless the backend later gains an authoritative domain model for them.

---

## Company/customer management operations

The Fluid customer-company schema also contains authorised company-management operations for users/roles, catalogue policy, purchase controls and Employee management.

Those are primarily used by the company-management portal in `css_admin`.

The shopping storefront should consume **shopping-facing read signals** where necessary, but should not become a second management application unless product scope explicitly requires it.

Important distinction:

```text
css_store
  customer shopping/account journeys

css_admin / company portal
  company configuration and management journeys
```

---

## Operations forbidden in css_store

Do not use:

- `css_admin_companies`
- `css_admin_company`
- any other `css_admin_*` query/mutation
- Magento Admin tokens
- direct OGL APIs
- direct database reads/writes

A missing customer-facing capability is a backend contract gap, not permission to borrow the Admin API.

---

## Proven reference files in css_kiosk

The following Kiosk files are useful because they have already been built against the accepted customer GraphQL journey:

- `lib/magento/customer-auth.ts` — `generateCustomerToken` request/error handling;
- `lib/magento/customer-context.ts` — `customer` + `css_company_context` verification;
- `lib/magento/catalogue.ts` — Magento categories/products/search selections;
- `lib/magento/cart.ts` — `customerCart`, add/update/remove cart operations;
- `lib/magento/locker-checkout.ts` — native address/shipping mutation semantics;
- `lib/magento/locker-order.ts` — native payment semantics and `cssSubmitCreditOrder` example.

Copy the GraphQL/domain understanding where useful, but strip kiosk-only assumptions such as local locker configuration, locker carrier enforcement and kiosk-specific payment choices.

---

## Backend acceptance status to carry forward

The Fluid staging record states that the agreed customer GraphQL launch scope has already passed targeted compatibility gates for:

- authentication;
- company context;
- permissions/capabilities;
- catalogue and OGL/company pricing;
- stock / purchase allowance;
- cart and cart hardening;
- shipping / OGL path;
- payment / company credit;
- ordinary native checkout / `placeOrder`;
- credit-order lifecycle;
- returns submission.

This means `css_store` should first attempt to consume the accepted contract. Backend work should begin only after a storefront request reproduces a real mismatch/gap.

## How to verify an operation before coding

1. inspect `0stoya/Fluid/Css/Commerce/etc/schema.graphqls` for CSS fields;
2. introspect the deployed Magento GraphQL schema when native field shape matters;
3. look for an accepted Altair/API-functional probe under `Css/Commerce/Test/ApiFunctional`;
4. check `css_kiosk` for a proven customer request example;
5. run the operation manually against the real environment before building a large UI around an assumption.
