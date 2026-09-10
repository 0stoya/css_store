# CSS Store roadmap

Last updated: 2026-09-09

## Purpose

`css_store` is the customer-facing headless storefront for Chelmsford Safety Supplies. Magento / Fluid GraphQL is the application API boundary and remains authoritative for authentication, company scope, catalogue visibility, pricing, purchase controls, cart validation, checkout, credit orders, employee attribution and order history.

The storefront must not duplicate Fluid business rules in the browser and must never call OGL directly.

## Current position

- [x] Repository bootstrapped.
- [x] Storefront Phase 1 merged in PR #1: Next.js foundation, Magento customer login/logout, HttpOnly token session, verified Fluid company context, company switching, storefront policy/capabilities and authenticated product catalogue/search.
- [ ] Record Phase 1 live-environment acceptance if not already captured during deployment: login, selected company, company switch, known company/OGL price, stock, product search and logout.
- [ ] Storefront Phase 2 is the next implementation block.

A GitHub merge is not, by itself, runtime acceptance. Every functional phase must also pass the real Magento GraphQL journey.

## Delivery principles

1. **GraphQL only from the storefront.** Browser/server code may call Magento GraphQL. It must not call OGL, Magento databases or Fluid internals directly.
2. **Magento owns identity.** Use native customer tokens. Do not create a second storefront account system.
3. **Fluid owns company scope.** `css_company_context` and `cssSelectCompany` are authoritative. Never trust a company ID supplied by the browser without backend validation.
4. **Backend permissions win.** UI visibility is convenience only; GraphQL must remain the enforcement boundary.
5. **Personalised commerce data is not public cache data.** Company pricing, cart, allowances, credit and orders must be fetched in authenticated context and treated as non-cacheable unless an explicitly safe cache strategy is proven.
6. **No speculative Magento compatibility work.** Add or change `Css/Commerce/**` only when storefront implementation exposes a real missing capability or contract defect.
7. **Keep Fluid compatibility changes additive.** Reuse existing services, keep resolvers non-final and preserve the accumulated root `Query` / `Mutation` schema layout.
8. **Use Kiosk as an accepted customer-GraphQL reference, not as storefront UX.** Normal storefront shipping/payment must remain dynamic and must not inherit kiosk-only locker or payment assumptions.

---

## Phase 1 — foundation and authenticated catalogue

**Status: merged — PR #1.**

Delivered:

- Next.js 16.3.4 / React 19.2.8 / TypeScript 6.0.3 / Node 22+ baseline;
- server-side Magento GraphQL client with configured `Store` header;
- native `generateCustomerToken` login;
- token verification using `customer` + `css_company_context`;
- HttpOnly, SameSite=Lax storefront token cookie;
- best-effort Magento token revoke on logout;
- company context display and `cssSelectCompany` switching;
- `css_ordering_capabilities` and `css_storefront_policy` consumption;
- authenticated product listing/search with Magento stock and company-context pricing;
- initial responsive storefront/account shell.

### Runtime gate

Before relying on Phase 1 in later work, confirm on the target environment:

1. valid company customer can sign in;
2. invalid login is rejected cleanly;
3. selected company is correct;
4. a multi-company customer can switch to another assigned company;
5. selected company persists on a fresh request;
6. known company/OGL price matches Magento GraphQL;
7. stock status matches Magento;
8. product search works for a known SKU/name;
9. logout clears local session and protected routes return to login.

---

## Phase 2 — categories, PDP, product configuration and employee-aware add-to-cart

**Next priority.**

### Catalogue navigation

- derive the storefront category tree from Magento/store configuration rather than copying the kiosk's deployment-specific root-category UID;
- category landing pages and pagination;
- product search with category filtering where supported;
- URL-safe product/category routes using Magento identifiers/URL keys;
- preserve backend catalogue visibility and company/role boundaries.

### Product detail page

- product image/gallery and core attributes;
- regular/final company price presentation;
- stock state;
- grouped/configurable product structure;
- configurable option selection using Magento option UIDs;
- quantity constraints and purchase-control/allowance messaging from the accepted GraphQL surface;
- disabled/clear add-to-cart states when Magento/Fluid says ordering is unavailable.

### Employee ordering

Consume:

- `css_company_employee_configuration`;
- `css_company_employees` for active selectable beneficiaries;
- `employee_id` on the grouped/configurable compatibility add-to-cart path;
- `cssAssignCartEmployee` and `cssAssignCartItemEmployee` for assignment/reassignment.

Required behaviour:

- `uses_employee = false`: normal product ordering, no Employee prompt;
- `uses_employee = true` and `multi_employee_basket = false`: basket is effectively for one Employee; changing Employee reassigns the basket rather than silently mixing lines;
- `uses_employee = true` and `multi_employee_basket = true`: Employee can be selected per line;
- send `employee_id`, never trust client-supplied employee name/code as canonical identity;
- inactive or cross-company employees must fail through GraphQL;
- two distinct employees with the same name must remain distinct by canonical Employee ID.

### Phase 2 acceptance

- category navigation is company-catalogue correct;
- simple product PDP works;
- grouped/configurable product choices and quantities match Magento;
- known OGL/company price is retained on PDP and cart;
- purchase-control/quantity rejection is surfaced without bypassing backend validation;
- employee-disabled company adds normally;
- single-employee basket rejects/mends mixed attribution correctly;
- multi-employee basket supports at least two employees in one cart;
- same-name employees remain separate;
- cart response shows canonical Employee assignment.

---

## Phase 3 — basket and normal storefront checkout

### Basket

- full `customerCart` view;
- update quantity and remove lines;
- grouped/configurable child presentation;
- line and basket Employee attribution UI;
- subtotal/grand total and company discount presentation;
- purchase eligibility/allowance messaging;
- empty/loading/error states;
- explicit handling for company switch while a cart already contains items.

### Shipping/address

Normal storefront checkout must be dynamic. Do **not** copy the kiosk's locker-only assumptions.

Implement:

- saved customer/company address selection where suitable;
- new shipping address entry if required by the agreed business flow;
- `setShippingAddressesOnCart`;
- render backend-provided `available_shipping_methods`;
- `setShippingMethodsOnCart` using the selected backend code;
- do not mutate saved address records merely to place Employee names into recipient/address fields.

### Payment and order placement

- render `available_payment_methods` dynamically;
- `setPaymentMethodOnCart` using a method that Magento exposes for that cart/company;
- ordinary allowed checkout uses native Magento `placeOrder`;
- credit/approval-required checkout uses the existing Fluid credit-order submission path rather than faking a Magento order;
- re-read cart/capabilities before final submit to avoid stale client decisions.

### Company switching with a non-empty cart

This needs explicit product behaviour before Phase 3 is considered complete. Do not silently carry a cart from Company A into Company B context.

Preferred safe options are:

1. block switch until the cart is emptied; or
2. ask for confirmation, clear/recreate the cart, then switch company.

Choose only after validating actual Magento/Fluid cart semantics on staging.

### Phase 3 acceptance

- ordinary native checkout completes end-to-end through `placeOrder`;
- shipping options are backend-driven;
- payment options are backend-driven;
- company discount/purchase-control state remains coherent;
- Employee snapshots reach `sales_order_item` correctly;
- multi-employee order survives checkout;
- credit-order-required cart does not bypass approval;
- failed checkout cannot create duplicate orders;
- company switch cannot leak a previous company's cart/pricing/employee attribution.

---

## Phase 4 — account and operational workflows

### Orders

- `css_company_orders` with pagination;
- order detail using the accepted Magento/customer order surface;
- company-order visibility obeys Fluid permissions;
- Employee-attributed line presentation where available.

### Credit orders

- `css_credit_orders` scopes relevant to the authenticated user;
- `css_credit_order` detail/history/comments;
- approve/reject/cancel actions only when the backend exposes them as valid for the current actor;
- PO-number completion where the accepted lifecycle requires it;
- eventual Magento order linkage.

`approved_pending_payment` compatibility exists in Fluid but is **outside the current launch UI** unless the real configured business process begins producing that status. If it becomes real, re-open its backend acceptance gate before exposing it.

### Repeat order

- repeat-order list browsing and management;
- grouped/configurable repeat-order compatibility;
- preserve canonical Employee attribution where the Employee remains active;
- require reassignment instead of silently ordering for an inactive Employee.

### Returns

- `css_returns_configuration`;
- authenticated `cssSubmitReturnRequest` flow;
- only expose the request/contact workflow that the existing `Css_Returns` module actually supports;
- do not invent RMA history/reason/status features without an authoritative backend model.

### Phase 4 acceptance

- own/company-visible orders match role permission;
- credit-order approval lifecycle works with real fixtures;
- repeat order rebuilds expected products/options/Employee identity;
- inactive Employee repeat requires intervention;
- returns request persists and executes the configured email/queue side effect.

---

## Phase 5 — storefront UX, content and commerce polish

After the transaction flows are stable:

- responsive navigation/header/basket drawer as appropriate;
- accessible forms, dialogs and product option controls;
- consistent loading/error/empty/success patterns;
- session-expiry recovery without losing explanatory context;
- product/category metadata and canonical URLs;
- Magento CMS/content integration where required;
- legal/contact/help pages required for launch;
- image optimisation/media-host configuration;
- search refinements and useful filters that are supported by Magento attributes;
- price/tax presentation aligned with the agreed B2B requirement;
- performance pass without caching personalised pricing or account data incorrectly.

Avoid building wishlist, comparison, recommendations or other features until there is a confirmed business requirement and GraphQL contract.

---

## Phase 6 — launch hardening

Run the complete real-customer journey against production-like Magento/Fluid configuration.

### Build gate

```bash
yarn typecheck
yarn lint
yarn build
```

### Live regression journey

At minimum:

1. login/logout and expired session;
2. customer with one company;
3. customer with multiple companies;
4. company switch;
5. category/search/PDP;
6. simple add-to-cart;
7. grouped/configurable add-to-cart;
8. purchase-limit rejection;
9. single-Employee basket;
10. multi-Employee basket;
11. quantity update/remove/reassignment;
12. normal delivery/address/shipping;
13. ordinary native `placeOrder`;
14. approval-required credit order;
15. company order history;
16. repeat order;
17. returns submission;
18. known OGL/company price regression;
19. inaccessible company/Employee/order identifiers cannot escape scope;
20. mobile and keyboard accessibility smoke.

Do not call the storefront production-ready solely because the frontend build passes.

---

## Known decisions / questions to resolve during implementation

These should be answered by real Magento/Fluid behaviour or explicit business requirement, not by frontend guesswork.

### Before Phase 2

- authoritative storefront category root and desired top-level category navigation;
- product URL strategy: Magento URL key vs SKU/UID fallback;
- exact attributes/filters that should appear to customers;
- tax presentation: ex VAT, inc VAT, or both;
- whether guest browsing is in launch scope. Current Phase 1 deliberately requires authentication.

### Before Phase 3

- company-switch behaviour with non-empty cart;
- allowed shipping-address sources and whether users may create a new address during checkout;
- which normal delivery methods are expected in production;
- which payment methods are expected besides company credit/account;
- whether PO/reference entry is required for ordinary Magento checkout;
- how Employee attention/recipient should appear on fulfilment paperwork without mutating saved company addresses.

### Before Phase 5

- required CMS/legal pages;
- analytics/consent requirement;
- SEO/indexing expectations for a mostly authenticated B2B catalogue;
- production media/CSP/remote-image hosts;
- accessibility target and supported browsers/devices.

---

## Backend-gap rule

When storefront work reveals a real missing capability:

1. reproduce the gap directly against Magento GraphQL;
2. check whether native Magento or an accepted CSS operation already provides the capability;
3. if backend work is genuinely required, implement compatibility under `0stoya/Fluid/Css/Commerce/**` only unless an existing authoritative service is merely being reused;
4. reuse Fluid/CSS repositories and services rather than duplicating domain logic;
5. keep GraphQL resolvers non-final;
6. keep schema changes additive and preserve the accumulated root `type Query` / `type Mutation` structure;
7. add focused Altair/API-functional acceptance;
8. deploy and runtime-accept the backend before treating the storefront dependency as stable.

Never solve a missing customer API by calling `css_admin_*`, impersonating an admin, querying OGL from the browser, or copying ACL rules into JavaScript.

---

## References

- `docs/ARCHITECTURE.md` — storefront architecture, security and state rules.
- `docs/GRAPHQL_CONTRACT.md` — accepted Magento/Fluid GraphQL surface mapped to storefront features.
- `docs/DELIVERY.md` — development workflow, validation, backend-gap procedure and definition of done.
- `0stoya/Fluid/Css/Commerce/etc/schema.graphqls` — authoritative CSS GraphQL schema.
- `0stoya/Fluid/Css/Commerce/Test/ApiFunctional/phased/STAGING_STATUS.md` — accepted backend/customer GraphQL staging position.
- `0stoya/css_kiosk` — proven customer-GraphQL implementation examples; reuse transport/domain understanding, not kiosk-specific UX assumptions.
- `0stoya/css_admin` — useful management-app UI/error/session patterns; never use Admin GraphQL contracts in the customer storefront.

## Resume point

Start the next implementation chat with:

> Storefront Phase 1 is merged. Build Phase 2 from current `css_store/main`: Magento categories + PDP + grouped/configurable selection + purchase-control messaging + Employee-aware add-to-cart. Keep Magento/Fluid GraphQL authoritative; do not add backend work unless a real contract gap is reproduced.
