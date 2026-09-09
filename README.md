# CSS Store

Headless customer storefront for Chelmsford Safety Supplies, backed by Magento / Fluid GraphQL.

Magento / Fluid GraphQL is the application API boundary. The storefront does not call OGL directly and must not use Magento-admin / `css_admin_*` contracts.

## Current status

Storefront Phase 1 is merged:

- native Magento customer-token login and revoke/logout;
- HttpOnly storefront session cookie;
- verified `customer` + `css_company_context` bootstrap;
- company selection through `cssSelectCompany`;
- `css_ordering_capabilities` and `css_storefront_policy` consumption;
- authenticated Magento catalogue search/listing with company-context pricing and stock;
- responsive customer/account/store shell.

The next implementation block is **Phase 2: categories + PDP + grouped/configurable selection + purchase-control messaging + Employee-aware add-to-cart**.

## Project handbook

Read these before starting a new storefront slice:

- [`ROADMAP.md`](ROADMAP.md) — phased delivery plan, acceptance gates, open business decisions and resume point.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — security, authentication, company scope, Employee/cart/checkout invariants and OGL/backend boundaries.
- [`docs/GRAPHQL_CONTRACT.md`](docs/GRAPHQL_CONTRACT.md) — accepted native Magento and Css_Commerce GraphQL operations mapped to storefront features.
- [`docs/DELIVERY.md`](docs/DELIVERY.md) — branch/PR workflow, validation, GraphQL client conventions, backend-gap procedure and definition of done.

## Local setup

```bash
cp .env.example .env.local
yarn install
yarn dev
```

Required environment variable: `MAGENTO_GRAPHQL_URL`.

Validation:

```bash
yarn typecheck
yarn lint
yarn build
```

A successful frontend build does not replace the real Magento/Fluid GraphQL journey for transactional acceptance.
