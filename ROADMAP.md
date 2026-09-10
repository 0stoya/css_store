# CSS Store roadmap

Last updated: 2026-09-10

## Purpose

`css_store` is the customer-facing headless storefront for Chelmsford Safety Supplies. Magento / Fluid GraphQL is the application API boundary and remains authoritative for authentication, company scope, catalogue visibility, pricing, purchase controls, cart validation, checkout, credit orders, Employee attribution and order history.

The storefront must not duplicate Fluid business rules in the browser and must never call OGL directly.

## Current position

| Block | Status | Evidence / notes |
| --- | --- | --- |
| Phase 1 — foundation/authenticated catalogue | MERGED | PR #1 |
| Phase 2 — categories/PDP/configuration/Employee add-to-cart | MERGED + RUNTIME USED | PR #3, config hotfix #4 |
| Native Magento grouped-product compatibility | MERGED + RUNTIME ACCEPTED | PR #7; real grouped PDP/cart flow accepted |
| Session-expiry hardening | MERGED + RUNTIME ACCEPTED | PR #8; stale customer cookie recovery accepted |
| Phase 3A — basket | MERGED | PR #5 |
| Phase 3B — delivery/shipping | MERGED | PR #6 |
| Phase 3C — payment/order submission | MERGED | PR #9; build/type/lint gate green; destructive real-order journeys remain part of launch regression |
| Phase 4A — company order history | MERGED + RUNTIME ACCEPTED | PR #10 |
| Phase 4B — credit-order workflow | MERGED + RUNTIME ACCEPTED | PR #11 |
| Phase 4C — repeat orders | MERGED + RUNTIME ACCEPTED | PR #12 |
| Phase 4D — returns request | MERGED + RUNTIME ACCEPTED | PR #13 |
| **Phase 5 — UX/content/commerce polish** | **IN PROGRESS** | Phase 5A accessibility foundation is the first focused slice |
| Phase 6 — launch hardening | PLANNED | Complete production-like regression journey |

A GitHub merge is not, by itself, runtime acceptance. Functional blocks should be exercised against real Magento / Fluid GraphQL fixtures, and irreversible order-placement paths must be covered again during Phase 6.

## Delivery principles

1. **GraphQL only from the storefront.** Browser/server code may call Magento GraphQL. It must not call OGL, Magento databases or Fluid internals directly.
2. **Magento owns identity.** Use native customer tokens. Do not create a second storefront account system.
3. **Fluid owns company scope.** `css_company_context` and `cssSelectCompany` are authoritative. Never trust a company ID supplied by the browser without backend validation.
4. **Backend permissions win.** UI visibility is convenience only; GraphQL remains the enforcement boundary.
5. **Personalised commerce data is not public cache data.** Company pricing, cart, allowances, credit and orders are authenticated context and must not be cached as public data.
6. **No speculative Magento compatibility work.** Change `Css/Commerce/**` only when storefront implementation reproduces a real missing capability or contract defect.
7. **Keep Fluid compatibility additive.** Reuse existing services, keep resolvers non-final and preserve the accumulated root `Query` / `Mutation` schema layout.
8. **Use Kiosk as an accepted customer-GraphQL reference, not as storefront UX.** Normal storefront shipping/payment remains dynamic and must not inherit kiosk-only locker/payment assumptions.

---

## Phase 1 — foundation and authenticated catalogue

**Status: merged — PR #1.**

Delivered:

- Next.js / React / TypeScript storefront foundation;
- server-side Magento GraphQL client with configured `Store` header;
- native `generateCustomerToken` login;
- token verification using `customer` + `css_company_context`;
- HttpOnly, SameSite=Lax storefront token cookie;
- best-effort Magento token revoke on logout;
- company context display and `cssSelectCompany` switching;
- `css_ordering_capabilities` and `css_storefront_policy` consumption;
- authenticated product listing/search with Magento stock and company-context pricing.

---

## Phase 2 — categories, PDP, product configuration and Employee-aware add-to-cart

**Status: merged — PR #3, config hotfix #4; native grouped compatibility PR #7 runtime accepted.**

Delivered:

- category tree from Magento store configuration;
- category landing/search/pagination;
- product detail with company price, stock and purchase-control signals;
- native configurable selection using Magento option UIDs;
- Fluid grouped/configurable add through `cssAddGroupedConfigurableProductsToCart`;
- native Magento `GroupedProduct` support using native cart writes protected by Fluid guards;
- Employee ordering via `css_company_employee_configuration` / `css_company_employees`;
- canonical `employee_id` assignment;
- single-Employee basket reassignment and multi-Employee line attribution;
- purchase decisions left authoritative to Magento / Fluid.

Runtime evidence includes a real native Magento grouped product opening, configuring and adding successfully without bypassing Fluid cart hardening.

---

## Session-expiry hardening

**Status: merged and runtime accepted — PR #8.**

- classifies customer-session rejection separately from Magento outages;
- clears stale `css_store_customer` cookies;
- redirects to login with an expiry explanation rather than returning a storefront 500;
- preserves shared authenticated GraphQL behaviour for catalogue, basket, checkout and account routes.

---

## Phase 3 — basket and normal storefront checkout

**Status: implemented and merged — PRs #5, #6 and #9.**

### Phase 3A — basket

- authenticated `customerCart` view;
- quantity updates and remove-line mutations;
- configurable/grouped presentation;
- Employee attribution/reassignment;
- company discount, credit and purchase-eligibility context;
- empty/loading/error states;
- company switching blocked while the current basket has items.

### Phase 3B — delivery

- saved customer address selection;
- one-off cart-only delivery address;
- native `setShippingAddressesOnCart`;
- dynamic backend `available_shipping_methods`;
- native `setShippingMethodsOnCart`;
- configurable/grouped and Employee line continuity through delivery.

### Phase 3C — payment and order submission

- dynamic `customerCart.available_payment_methods`;
- native `setPaymentMethodOnCart`;
- cart-only billing alignment with selected shipping address;
- cart/payment/capability re-read immediately before irreversible submit;
- ordinary non-credit checkout uses Magento `placeOrder` only for an `ALLOWED` Fluid cart;
- credit-order-enabled company users submit through `cssSubmitCreditOrder`, allowing Fluid to decide approval, auto-approval and sales-order creation;
- confirmation UI for Magento order and Fluid credit-order outcomes.

### Remaining Phase 3 launch gate

The storefront implementation/build gate is green, but Phase 6 must still repeat real disposable fixtures for:

- native `placeOrder` end-to-end;
- approval-required credit order end-to-end;
- Employee snapshots on resulting sales-order items;
- multi-Employee order persistence;
- grouped/configurable order persistence;
- no duplicate order after a failed/retried checkout;
- no company/cart leakage across company switching.

---

## Phase 4 — account and operational workflows

### Phase 4A — company orders

**Status: merged and runtime accepted — PR #10.**

- `/account/orders` backed by Fluid `css_company_orders`;
- pagination and selected-company/role visibility from Fluid;
- order number/date/status and Magento totals;
- real persisted order lines and selected options;
- immutable `css_employee` snapshots where present;
- grouped orders displayed as their actual persisted Magento lines rather than fabricated grouping.

### Phase 4B — credit orders

**Status: merged and runtime accepted — PR #11.**

- MY / COMPANY / APPROVAL queues where Fluid authorises them;
- paginated `css_credit_orders` list;
- `css_credit_order` detail with status, comments and lifecycle logs;
- approve/reject/cancel/place controls driven by current `actions` state;
- server-side re-read before lifecycle mutation;
- authorised PO-number completion where the lifecycle requires it;
- Magento order linkage after sales-order creation;
- `requires_payment_details` never exposes Place order.

`approved_pending_payment` compatibility exists in Fluid but remains **outside the current launch UI** because the accepted launch configuration does not produce that state. Re-open the Phase 12 backend acceptance gate if business/payment configuration changes.

### Phase 4C — repeat orders

**Status: merged and runtime accepted — PR #12.**

Delivered against the accepted Fluid repeat-order contract:

- `/account/repeat-orders` browses and manages customer-owned repeat lists;
- grouped-configurable PDP selections can be saved with canonical variant and Employee data resolved server-side;
- list rows expose compatibility and intervention reasons rather than silently substituting stale selections;
- selected/all compatible list items are rebuilt through `cssAddRepeatOrderListToCart` with the existing basket preserved;
- previous company orders can be rebuilt through `cssRepeatGroupedConfigurableOrder`;
- current company, Employee, stock and purchase restrictions remain authoritative in Fluid / Magento;
- inactive/missing Employee and incompatible old rows surface intervention instead of silent reassignment.

### Phase 4D — returns

**Status: merged and runtime accepted — PR #13.**

- `/account/returns` consumes `css_returns_configuration` and hides the form when the backend says the service is unavailable;
- authenticated requests submit through `cssSubmitReturnRequest`;
- order number remains an optional request reference rather than a browser-owned eligibility assertion;
- order history can prefill that order reference;
- successful submissions surface the authoritative request ID/message;
- only the existing `Css_Returns` request/contact and queue/email workflow is exposed;
- no RMA history, item eligibility, reason catalogue or lifecycle status is invented by the storefront.

### Phase 4 completion gate

**Status: accepted for the implemented Phase 4 launch scope.**

- own/company-visible orders match role permission;
- credit-order lifecycle matches Fluid action state;
- repeat order rebuilds expected products/options/Employee identity;
- inactive Employee repeat requires intervention;
- returns request persists and executes the configured queue/email side effect.

---

## Phase 5 — storefront UX, content and commerce polish

**Status: current implementation phase.**

### Phase 5A — accessibility foundation

First focused slice, currently in progress:

- keyboard skip navigation around the persistent storefront header;
- clear `:focus-visible` treatment across links, buttons, form controls and expandable summaries;
- 44px navigation targets and safer small-screen header wrapping;
- shared textarea/form-control presentation instead of route-specific styling;
- preserve all existing server actions and Magento/Fluid authority unchanged.

### Remaining Phase 5 work

After the accessibility foundation is accepted:

- responsive navigation/header/basket refinement as appropriate;
- accessible forms, dialogs and product option controls;
- consistent loading/error/empty/success patterns;
- session-expiry recovery with useful return context;
- product/category metadata and canonical URLs;
- Magento CMS/content integration where required;
- legal/contact/help pages required for launch;
- **image optimisation/media-host configuration** (resolve the existing `<img>` lint warnings here rather than suppressing them);
- search refinements and useful Magento-supported filters;
- price/tax presentation aligned with the agreed B2B requirement;
- performance pass without unsafe caching of personalised pricing/account data.

Avoid wishlist, comparison, recommendations or other scope unless there is a confirmed business requirement and GraphQL contract.

---

## Phase 6 — launch hardening

Run the complete real-customer journey against production-like Magento / Fluid configuration.

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
4. company switch with empty/non-empty basket behaviour;
5. category/search/PDP;
6. simple add-to-cart;
7. native grouped and configurable add-to-cart;
8. Fluid grouped/configurable add where a fixture exists;
9. purchase-limit rejection;
10. single-Employee basket;
11. multi-Employee basket;
12. quantity update/remove/reassignment;
13. normal delivery/address/shipping;
14. ordinary native `placeOrder`;
15. approval-required credit order;
16. company order history;
17. credit-order queues/detail/actions;
18. repeat order;
19. returns submission;
20. known OGL/company price regression;
21. inaccessible company/Employee/order identifiers cannot escape scope;
22. mobile and keyboard accessibility smoke.

Do not call the storefront production-ready solely because the frontend build passes.

---

## Known decisions / questions to resolve

Prefer real Magento / Fluid behaviour or an explicit business requirement over frontend guesses.

### During Phase 5

- required CMS/legal pages;
- analytics/consent requirement;
- SEO/indexing expectations for the authenticated B2B catalogue;
- production media/CSP/remote-image hosts;
- accessibility target and supported browsers/devices;
- final ex-VAT/inc-VAT display convention where not already dictated by Magento output.

---

## Backend-gap rule

When storefront work reveals a real missing capability:

1. reproduce the gap directly against Magento GraphQL;
2. check whether native Magento or an accepted CSS operation already provides it;
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
- `0stoya/css_admin` — management-app UI/error/session patterns only; never use Admin GraphQL contracts in the customer storefront.

## Resume point

Start the next implementation chat with:

> Storefront Phase 4 is complete and runtime accepted through PR #13. Phase 4C Repeat Orders is PR #12 and Phase 4D Returns is PR #13. Continue Phase 5 from current `css_store/main`. Phase 5A is the focused accessibility foundation: keyboard navigation/focus, responsive header targets and shared form-control treatment without changing Magento/Fluid business rules. Keep unresolved CMS/legal, analytics/consent, SEO, media-host, accessibility-target and tax-display decisions explicit rather than guessing them.
