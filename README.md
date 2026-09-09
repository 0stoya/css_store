# CSS Store

Headless customer storefront for Chelmsford Safety Supplies, backed by Magento / Fluid GraphQL.

## Phase 1

The first vertical slice provides:

- native Magento customer-token login and revoke/logout;
- HTTP-only storefront session cookie;
- verified `customer` + `css_company_context` bootstrap;
- company selection through `cssSelectCompany`;
- `css_ordering_capabilities` and `css_storefront_policy` consumption;
- authenticated Magento catalogue search/listing with company-context pricing and stock;
- responsive customer/account/store shell.

The browser never talks to OGL directly. Magento/Fluid GraphQL remains the application API boundary.

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
