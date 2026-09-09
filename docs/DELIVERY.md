# Storefront delivery guide

This document defines how to build, review and accept `css_store` slices without rediscovering project constraints each time.

## Repositories and responsibilities

### `0stoya/css_store`

Owns the customer-facing storefront application:

- login/session UX;
- catalogue/search/PDP;
- cart and checkout UI;
- company-aware customer account journeys;
- Employee ordering UX;
- company order history;
- credit-order customer actions;
- repeat order;
- returns request;
- storefront accessibility/performance/content.

### `0stoya/Fluid`

Owns Magento modules, Fluid compatibility, GraphQL contracts and server acceptance evidence.

If storefront work exposes a real backend gap, normal compatibility changes remain under:

```text
Css/Commerce/**
```

Do not edit sibling Fluid modules simply to make the frontend easier.

### `0stoya/css_kiosk`

Reference implementation for the already-accepted customer GraphQL journey.

Use it for transport/query examples, not as the storefront's product/UX specification.

### `0stoya/css_admin`

Reference for polished management UI/session/error patterns and company management product knowledge.

Never use its Magento-admin token or `css_admin_*` GraphQL contract in `css_store`.

---

## Runtime baseline

Keep the storefront aligned with the existing application family unless there is a deliberate upgrade PR:

- Node.js 22+
- Next.js 16.3.4
- React 19.2.8
- React DOM 19.2.8
- TypeScript 6.0.3
- ESLint 9 / Next ESLint configuration

Avoid dependency drift between CSS applications without a reason.

## Environment

Current Phase 1 environment:

```env
MAGENTO_GRAPHQL_URL=https://commerce.example.com/graphql
MAGENTO_STORE_CODE=default
NEXT_PUBLIC_STORE_NAME=Chelmsford Safety Supplies
```

Rules:

- never commit `.env.local` or credentials;
- the GraphQL URL may be private/server-side; do not unnecessarily expose it through `NEXT_PUBLIC_*`;
- Magento customer tokens belong in server-managed HttpOnly cookies;
- OGL credentials must never exist in this repository;
- if production media/CSP configuration is added later, document all required hosts explicitly.

## Local setup

```bash
cp .env.example .env.local
yarn install
yarn dev
```

## Required build gate

Every frontend PR must pass:

```bash
yarn typecheck
yarn lint
yarn build
```

The real target environment remains authoritative for integrated Magento/Fluid behaviour.

A successful Next.js build does not prove catalogue scope, OGL/company pricing, purchase controls, checkout or credit-order lifecycle.

---

## Branch and PR model

Prefer focused vertical-slice PRs.

Examples:

```text
feature/storefront-phase-2-catalogue-pdp
feature/storefront-phase-3-cart-checkout
feature/storefront-phase-4-account-orders
polish/storefront-accessibility
fix/storefront-company-switch-cart
```

A normal feature PR should:

- start from current `main`;
- avoid unrelated refactors;
- include the GraphQL operations/types needed by that slice;
- include loading/error/empty states for the slice;
- document environment changes;
- include concrete live acceptance steps in the PR body;
- not bundle speculative backend compatibility work into the frontend repository.

If a backend dependency is required, land and runtime-accept the Fluid PR first or clearly stack the frontend PR as dependent until the contract is accepted.

---

## Definition of done for a storefront slice

### Code

- TypeScript types reflect actual GraphQL data used by the screen.
- No secrets/customer tokens are sent to client JavaScript.
- No Admin/OGL/direct-database integrations.
- Company/Employee/order IDs are passed to Magento for authorization, not trusted locally.
- Backend validation errors are handled as expected user-facing states where appropriate.
- Responsive UI is usable on desktop and mobile.
- Keyboard/focus behaviour is reasonable for interactive controls.

### Build

- `yarn typecheck`
- `yarn lint`
- `yarn build`

### Live GraphQL acceptance

Test the exact real customer journey introduced by the PR, including one expected failure path.

Examples:

- invalid login;
- inaccessible product/company;
- quantity above allowance;
- inactive Employee;
- wrong-company Employee ID;
- unavailable shipping method;
- unavailable payment method;
- credit-order action not permitted.

### Data integrity

For transactional PRs, verify the resulting Magento/Fluid state rather than trusting the success screen.

Depending on the slice this may include:

- cart contents/options;
- Employee assignment;
- order row snapshots;
- credit-order lifecycle log;
- purchase-control consumption;
- returns request persistence;
- OGL export visibility through existing Magento/Fluid status where relevant.

---

## GraphQL client conventions

Keep Magento calls small and feature-oriented.

Suggested structure as the app grows:

```text
lib/
  magento/
    client.ts
    auth.ts
    context.ts
    catalogue.ts
    product.ts
    employees.ts
    cart.ts
    checkout.ts
    orders.ts
    credit-orders.ts
    repeat-orders.ts
    returns.ts
```

Do not put all schema operations into one giant client module.

### Request rules

- send configured `Store` header on every Magento request;
- authenticated customer operations include `Authorization: Bearer <token>` server-side;
- use `cache: "no-store"` for personalised company/customer commerce state by default;
- send GraphQL variables rather than constructing user values into query strings;
- parse both HTTP status and GraphQL `errors`;
- model predictable domain errors separately from malformed/unavailable service errors where useful.

### Query naming

Use application-specific operation names even though root fields are Magento/CSS fields, for example:

```graphql
query StorefrontProductPage(...)
mutation StorefrontAssignEmployee(...)
mutation StorefrontPlaceOrder(...)
```

This makes GraphQL logs easier to diagnose.

### Fragment discipline

Use fragments when multiple pages truly share a stable selection (for example cart totals/line summary). Avoid building one oversized “everything” fragment that causes every screen to fetch unrelated fields.

---

## Server/client component boundary

Default to server components for authenticated commerce reads where practical.

Use client components for actual interactive state such as:

- product option selection;
- quantity controls;
- Employee selector modal/popover;
- cart line interactions where immediate UI feedback is needed;
- checkout step controls.

Mutations should route through server actions or controlled server endpoints when that keeps the Magento token server-side.

Do not solve interactivity by putting the Magento customer token into browser storage.

## Session expiry

All authenticated feature clients should have a consistent way to classify Magento authorization failures.

Desired behaviour:

1. Magento says token/session is invalid/unauthorized;
2. clear local HttpOnly token;
3. redirect to login;
4. optionally preserve a safe return path;
5. explain that the session expired rather than showing a generic server error.

Do not create an infinite redirect if Magento itself is unavailable.

---

## Store/company context changes

After `cssSelectCompany`, assume all of these may have changed:

- catalogue visibility;
- price;
- purchase controls;
- Employee list/config;
- company credit;
- payment methods;
- order visibility;
- credit-order queues;
- potentially validity of an existing cart.

Do not keep stale company-derived data in long-lived client state.

## Pricing display

The storefront must render authoritative Magento-returned values.

Do not calculate OGL pricing, company discount or negotiated price client-side.

Before final launch polish, explicitly settle the business presentation requirement for:

- ex-VAT vs inc-VAT prices;
- regular price vs final/company price display;
- “price hidden” guest behaviour;
- whether zero/null price is a valid state or a data/configuration problem.

## Stock display

Do not promise delivery dates or numeric availability unless the deployed Magento/Fluid GraphQL contract actually supplies authoritative data for them.

`IN_STOCK`/`OUT_OF_STOCK` should be treated separately from quantity/purchase-control allowance.

---

## Employee ordering delivery checklist

Before implementing the Employee selector, verify live:

```text
css_company_employee_configuration
css_company_employees(active: true)
```

Then test all three company modes:

1. Employees disabled;
2. Employees enabled + single Employee basket;
3. Employees enabled + multi Employee basket.

For cart writes:

- use canonical `employee_id`;
- allow backend to derive Employee name/code;
- display the returned canonical assignment;
- handle inactive Employee errors;
- handle wrong-company Employee errors;
- ensure same-name Employees do not collapse into one identity.

For single-Employee companies, prefer an “Ordering for …” basket-level selector/reassignment model.

For multi-Employee companies, show the selected Employee visibly on each line and provide line-level reassignment.

---

## Checkout delivery checklist

Before building final UI, manually inspect one real cart's:

- shipping address requirements;
- `available_shipping_methods`;
- `available_payment_methods`;
- `css_ordering_capabilities`;
- purchase eligibility/allowance result;
- company credit/discount context.

The normal storefront must not assume values from kiosk fixtures.

### Ordinary order path

```text
set shipping address
→ set shipping method
→ set payment method
→ re-read cart/capabilities
→ placeOrder
```

### Credit order path

```text
prepare cart/shipping/payment as required
→ cssSubmitCreditOrder
→ show returned lifecycle state
→ approval/PO flow through CSS credit-order operations
→ eventual Magento order only when backend lifecycle permits
```

Prevent double submission at the UI layer, while also relying on backend lifecycle validation.

---

## Backend-gap procedure

If the storefront cannot complete a business flow:

### 1. Reproduce directly against GraphQL

Remove UI variables. Execute the smallest query/mutation that demonstrates the gap on the real environment.

### 2. Check existing sources

- deployed Magento introspection;
- `Fluid/Css/Commerce/etc/schema.graphqls`;
- `Fluid/Css/Commerce/Test/ApiFunctional`;
- `css_kiosk` accepted customer flow;
- relevant existing Fluid services.

### 3. Classify the gap

It should be one of:

- frontend bug;
- configuration/data issue;
- native Magento capability already exists;
- CSS contract defect;
- genuinely missing business capability.

### 4. If backend work is needed

Use `0stoya/Fluid` and keep runtime compatibility under `Css/Commerce/**`.

Preserve project rules:

- additive schema;
- no speculative endpoints;
- resolvers non-final where interception can occur;
- reuse existing repositories/services;
- backend-authoritative company/ACL checks;
- focused Altair acceptance;
- deploy + `setup:di:compile` + live GraphQL test before relying on it.

### 5. Never workaround with

- Magento Admin GraphQL/token;
- `css_admin_*` calls;
- direct OGL browser calls;
- direct SQL/database calls;
- duplicated ACL/business rules in TypeScript.

---

## Known implementation traps

### Magento GraphQL response success

HTTP 200 can still contain GraphQL `errors`. Always inspect both.

### Personalised caching

A product query under one selected company can have a different price/visibility under another. Do not accidentally cache it globally.

### Configurable/grouped identity

Use Magento option/UID relationships and the CSS grouped-configurable compatibility operation. Do not infer child SKU by string parsing.

### Employee same-name collision

Two Employees may have the same display name. Canonical ID must remain part of cart identity.

### Historical employee rename

Order history must show immutable order snapshots, not today's Employee name if it has changed.

### Credit checkout vs native checkout

A cart requiring approval is not an ordinary `placeOrder` cart. The UI cannot override this.

### Kiosk assumptions

Kiosk code intentionally knows about `csslocker/locker` and a specific account-payment journey. Storefront delivery/payment must remain backend-driven.

### `approved_pending_payment`

Compatibility exists but the accepted launch process currently does not produce this state. Do not add UI or fixtures for it unless production configuration changes.

### Returns

Current backend supports request submission, not a full RMA lifecycle.

---

## PR body template

Use something close to this for functional storefront slices:

```markdown
## Summary

What customer journey this PR adds.

## GraphQL contract

Native Magento operations:
- ...

CSS / Fluid operations:
- ...

No direct OGL/Admin integration.

## Behaviour

- happy path
- permission/business-rule path
- important failure state

## Validation

```bash
yarn typecheck
yarn lint
yarn build
```

Live journey:
1. ...
2. ...
3. expected rejection ...

## Backend dependencies

None / accepted Fluid PR #...

## Next phase

...
```

---

## Resume checklist for a new development session

Before starting a new slice:

1. read `ROADMAP.md` current phase;
2. read this file's relevant checklist;
3. inspect `docs/GRAPHQL_CONTRACT.md`;
4. confirm current `main` and latest merged PR;
5. verify the real GraphQL operation manually if its shape is not already used by the storefront;
6. create a focused feature branch;
7. implement frontend first;
8. only open Fluid backend work if the real request proves a contract gap.
