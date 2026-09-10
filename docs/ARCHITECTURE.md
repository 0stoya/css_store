# Storefront architecture and invariants

This document records the architectural rules that should remain stable while `css_store` grows.

## System boundary

The storefront is a headless customer application over Magento / Fluid GraphQL.

```text
Browser
  ↓ HTTPS
Next.js css_store
  ↓ Magento GraphQL + Store header + customer token
Magento / Adobe Commerce
  ↓
Fluid / Css_Commerce compatibility services
  ↓
Magento data + existing Fluid modules + OGL integrations
```

The browser must never call OGL directly and must never connect to Magento databases or internal module endpoints.

## Application API

Magento GraphQL is the application API boundary.

Use native Magento GraphQL where it already models the capability correctly. Use `Css_Commerce` GraphQL operations where Fluid compatibility, company scope, employee attribution, purchase controls, OGL-aware behaviour or credit-order lifecycle requires it.

Do not create a second REST/BFF domain model just because Next.js is server-side. Thin server actions/routes may protect tokens and coordinate calls, but Magento/Fluid remains authoritative.

## Authentication

Launch architecture uses Magento customer tokens.

Current Phase 1 flow:

```text
email + password
  ↓
generateCustomerToken
  ↓
verify customer + css_company_context
  ↓
store token in HttpOnly cookie
```

Rules:

- the Magento customer token must not be exposed to client JavaScript;
- use HttpOnly, SameSite=Lax cookies; Secure in production;
- verify a newly issued token against `customer` and `css_company_context` before accepting the storefront session;
- logout should attempt native Magento token revocation, then clear the local session regardless of revoke outcome;
- authenticated data calls run server-side with the customer token;
- expired/invalid token handling must clear the storefront session and send the user back through login cleanly.

Do not build a parallel username/password store or local customer identity table.

## Company context

A Magento customer can belong to zero, one or multiple Fluid companies.

Authoritative operations:

- `css_company_context`
- `cssSelectCompany(company_id: Int)`

Rules:

- only active memberships returned by the backend are selectable;
- the selected company is authoritative for catalogue, pricing, permissions, employee records, cart validation, order visibility and credit-order scope;
- never trust a company ID from a URL/form as proof of membership;
- do not reproduce company membership/ACL rules in frontend code;
- after company selection, re-fetch personalised data rather than assuming previous values still apply.

### Company switch and carts

Company switching while a customer has an existing non-empty cart is a known transactional edge that must be explicitly solved in Phase 3.

Until real staging behaviour is validated, do not silently keep a Company A cart after selecting Company B.

Safe candidate behaviours are to block switching until the basket is empty, or confirm that the basket will be cleared before switching.

## Storefront policy and capabilities

Use backend policy/capability data to decide which actions make sense to render, but remember that hiding a button is not authorization.

Core accepted CSS queries:

- `css_storefront_policy`
- `css_ordering_capabilities`

`css_storefront_policy` controls guest/customer price/add-to-cart presentation rules.

`css_ordering_capabilities` is the authoritative customer/company ordering capability summary, including checkout and credit-order availability.

Always expect the backend to reject a stale or forged write even if the UI thought it was available.

## Catalogue and pricing

Magento product/category GraphQL remains the source for storefront catalogue data.

Important rules:

- the customer token and selected company context must be present when company-specific catalogue/pricing is required;
- OGL customer pricing is surfaced through Magento/Fluid; `css_store` must never fetch OGL prices itself;
- display Magento's returned final price rather than reimplementing discounts client-side;
- company catalogue and role visibility are hard backend boundaries;
- product filters must use real Magento attributes; do not invent filtering semantics in the app;
- stock state is Magento/Fluid data, not a client calculation.

The kiosk is a useful working reference for product GraphQL selections, but its configured category root is deployment-specific. The storefront should derive/confirm the correct store category root rather than copying `KIOSK_MAGENTO_CATEGORY_ROOT_UID`.

## Product configuration

The storefront must handle the real Magento product model rather than flattening everything into a SKU textbox.

Phase 2 should support:

- simple products;
- configurable options through Magento option UIDs;
- Fluid grouped/configurable compatibility using the accepted CSS mutation;
- backend quantity constraints;
- purchase-control messaging and rejection.

Never infer a configurable child SKU by naming convention if Magento provides an option/variant relationship.

## Employee / beneficiary ordering

Employees are **not Magento customer accounts**. They are company-owned beneficiary records used for ordering attribution and reporting.

The browser submits canonical `employee_id`. Magento/Fluid validates that the Employee:

- belongs to the selected company;
- is active;
- is valid for the current basket policy.

Do not treat employee name/code as authoritative input.

### Company flags

- `uses_employee = false`: no employee attribution requirement.
- `uses_employee = true`, `multi_employee_basket = false`: one Employee across the basket.
- `uses_employee = true`, `multi_employee_basket = true`: different visible lines may belong to different Employees.

### Historical identity

New sales-order items persist immutable snapshots of Employee ID/name/code. A later Employee rename must not rewrite historical order identity.

Repeat-order handling must validate that the canonical Employee is still active before reusing them.

### Addresses

Do not overwrite or mutate saved company delivery addresses just to display `FAO Employee Name`.

Employee recipient/attention information should remain separate from canonical address data and be passed downstream through supported order/OGL metadata.

## Cart

Use the authenticated Magento customer cart.

Native operations already proven in the customer/kiosk journey include:

- `customerCart`
- `addProductsToCart`
- `updateCartItems`
- `removeItemFromCart`

Fluid/CSS adds compatibility for grouped/configurable products, purchase eligibility, company commercial context and Employee attribution.

The backend remains authoritative for:

- quantity/increment constraints;
- catalogue eligibility;
- purchase limits/allowances;
- employee/company scope;
- credit vs normal checkout decision;
- company discounts and credit availability.

A cart write should be followed by reading the returned/current cart rather than applying optimistic business-rule calculations locally.

## Checkout

Normal storefront checkout is intentionally different from kiosk checkout.

The kiosk is locker-specific and may deliberately hardcode a locker shipping method or account payment path. `css_store` must instead render the methods Magento makes available for the current cart.

### Normal Magento checkout

Typical native sequence:

```text
customerCart
  ↓
setShippingAddressesOnCart
  ↓
available_shipping_methods
  ↓
setShippingMethodsOnCart
  ↓
available_payment_methods
  ↓
setPaymentMethodOnCart
  ↓
placeOrder
```

Re-read capabilities/cart before final submission.

### Credit-order checkout

If Fluid says the cart requires/uses the credit-order approval path, submit through `cssSubmitCreditOrder` and then follow the backend lifecycle. Do not call `placeOrder` simply because the frontend can.

Supported current launch behaviour is either:

- auto-approved credit order which can create the Magento order; or
- approval-required credit order which reaches Magento order creation only after the required approval/PO lifecycle.

`approved_pending_payment` compatibility exists but is not a current launch UI state unless production configuration starts creating it.

## Orders and repeat order

Company order visibility is backend-authoritative through Fluid company permissions.

Use customer/company order GraphQL, not Magento-admin order APIs.

Repeat order must preserve:

- grouped/configurable structure;
- valid product options;
- canonical Employee assignment when still active;
- existing legacy compatibility for older employee-name-only orders.

If a product/Employee is no longer valid, return a clear user-facing intervention rather than silently changing the order.

## Returns

The existing backend return feature is a contact/request flow, not a full RMA state machine.

Storefront may expose availability and authenticated return-request submission only. Do not invent return history, item eligibility, RMA statuses or reason catalogs without corresponding backend domain state.

## Credit orders and approvals

Never calculate approval permissions in JavaScript.

Use the backend credit-order detail/actions for the logged-in company user. The server decides whether approve/reject/cancel/comment/PO completion is permitted.

Storefront should make lifecycle state obvious and idempotent. Avoid client retry behaviour that could produce duplicate actions/orders.

## OGL

OGL is deliberately behind Magento/Fluid.

The storefront must not:

- hold OGL credentials;
- fetch company pricing from OGL;
- call OGL order APIs;
- query OGL order history directly;
- reproduce OGL sales-representative or company mapping rules.

If downstream OGL metadata is missing, fix the Magento/Fluid export compatibility seam under `Css/Commerce/**` after reproducing the real gap.

## Caching

Default authenticated commerce calls to `no-store` until a safe policy is deliberately designed.

Never publicly cache data that can vary by:

- customer token;
- selected company;
- company catalogue/role;
- OGL/company pricing;
- purchase allowance;
- cart;
- employee attribution;
- company credit;
- order/credit-order visibility.

Guest/public CMS content may later use normal Next.js caching only after its dependencies are clear.

## Error handling

Separate errors conceptually into:

1. authentication/session expiry;
2. backend validation/rejection;
3. transport/service unavailable;
4. malformed/unexpected response;
5. business-state conflict (for example inactive Employee or approval required).

Do not collapse every GraphQL failure into “Something went wrong”. Where safe, surface the backend's domain reason in user-friendly language.

Never expose tokens, Magento stack traces, SQL errors or credentials.

## Security invariants

- customer token remains server-side;
- no admin token is ever used by `css_store`;
- `css_admin_*` GraphQL operations are not storefront APIs;
- no direct OGL access;
- company IDs, employee IDs, cart IDs and order numbers are untrusted request values until Magento validates them;
- backend ACL/company scope is authoritative;
- CSRF-sensitive state changes should stay in server actions/routes with normal same-site protections;
- secrets belong in environment configuration, not repository files.

## Dependency philosophy

The initial storefront intentionally has almost no runtime dependencies beyond Next/React.

Add a package only when it solves a real problem that cannot be cleanly handled with platform/Next.js primitives. Do not create shared packages with `css_admin`/`css_kiosk` until actual duplicated code justifies extraction.

## Useful reference implementations

### `0stoya/css_kiosk`

Use for:

- Magento customer auth transport;
- authenticated GraphQL request shape;
- product/category query examples;
- cart query/write examples;
- accepted shipping/payment/order GraphQL semantics.

Do **not** copy:

- kiosk assertion authentication;
- kiosk local locker configuration;
- hardcoded locker carrier/method;
- kiosk-only order status UX;
- assumptions that one payment method is always the storefront choice.

### `0stoya/css_admin`

Use for:

- polished form/table/error/session patterns;
- company management visual language where useful.

Do **not** copy Admin tokens, `css_admin_*` GraphQL calls or Magento-admin authorization into the customer app.

## Backend compatibility boundary

If a real storefront gap requires Fluid work, the normal compatibility location is:

```text
0stoya/Fluid/Css/Commerce/**
```

Preserve these project constraints:

- use existing domain services;
- resolvers likely to be intercepted must not be `final`;
- GraphQL root operations remain accumulated in the supported root Query/Mutation blocks;
- schema changes are additive;
- real Magento runtime acceptance is required before depending on the new contract.
