# SAP Ariba PunchOut — single-customer integration

**Status:** PUNCH.1 discovery/foundation  
**Scope:** one explicitly configured SAP Ariba customer; Level 1 PunchOut first; no middleware platform.

## Goal

Allow one approved customer to enter the existing Chelmsford Safety `css_store` storefront from SAP Ariba, shop against their normal Magento / Fluid company catalogue and pricing, then return the reviewed basket to SAP as cXML rather than placing the order directly in the storefront.

The intended first production journey is:

```text
SAP Ariba
  -> PunchOutSetupRequest
  -> css_store validates the configured buyer
  -> short-lived PunchOut session
  -> existing authenticated Magento / Fluid customer + company context
  -> existing catalogue / PDP / basket
  -> Return basket to SAP
  -> PunchOutOrderMessage
  -> SAP requisition / approval
```

Receiving an approved cXML `OrderRequest` is a later, separate capability unless the customer explicitly requires it for launch.

## Repository boundary

The primary integration belongs in `0stoya/css_store`.

`css_store` already owns:

- the customer-facing catalogue and product journeys;
- the authenticated Magento customer session;
- Fluid company context;
- company catalogue visibility and contract pricing;
- the authoritative Magento customer cart;
- basket display and quantity changes;
- the normal checkout transition.

PunchOut should reuse those paths rather than create a second catalogue, pricing engine or basket.

Magento / Fluid remains the application/domain authority. The storefront must not call OGL directly and must not use Magento Admin APIs.

The reviewed production backend seam is a small additive Fluid customer-session exchange tracked in `0stoya/Fluid#108`. css_store signs a short-lived one-use RS256 assertion only after its PunchOut setup/session boundary has authenticated the request. Fluid verifies that assertion against a public key, binds it to one configured customer/company/store, revalidates that relationship, consumes the assertion replay ID, and reuses the existing customer-token issuer. The storefront never stores or replays a customer's Magento password.

Fluid cannot currently be deployed, so development may temporarily use `SAP_PUNCHOUT_AUTH_MODE=preauthenticated`. In that mode the developer must first sign into css_store normally as the exact configured PunchOut test customer with the configured company already selected and an empty Magento cart. css_store verifies that existing customer token before consuming the StartPage token. This mode does not mint, impersonate or exchange a customer token and is rejected outright when `NODE_ENV=production`.

## Deliberately narrow launch scope

PUNCH.1–PUNCH.6 target one customer only.

Included:

- one configured SAP buyer identity / credential set;
- one configured Magento / Fluid customer/company mapping;
- Level 1 store-level PunchOut;
- cXML `PunchOutSetupRequest operation="create"`;
- one-time, short-lived PunchOut browser sessions;
- existing Magento / Fluid catalogue, prices, stock and cart;
- basket return through `PunchOutOrderMessage`;
- explicit SAP test acceptance before production enablement.

Not included initially:

- generic multi-customer onboarding;
- customer self-service credential management;
- Level 2 product indexing/search;
- OCI, Coupa, Jaggaer or generic procurement adapters;
- a generic cXML mapping engine;
- SAP PO `OrderRequest` intake;
- invoice / ASN cXML;
- normal storefront checkout from a PunchOut session.

If another customer later needs PunchOut, generalise the proven single-customer implementation rather than pre-building a platform.

## Proposed storefront routes

Exact names remain reviewable, but the intended public boundary is:

```text
POST /api/punchout/cxml
GET  /punchout/session/[token]
POST /api/punchout/return
```

### `POST /api/punchout/cxml`

Receives the customer's cXML `PunchOutSetupRequest`.

Responsibilities:

1. require PunchOut to be explicitly enabled;
2. enforce request/body size and content-type bounds;
3. parse cXML without resolving external entities or remote DTDs;
4. validate the configured `From` / `To` / `Sender` identity contract;
5. compare the SharedSecret without logging it;
6. validate timestamp within a bounded skew window;
7. reject replayed `payloadID` values;
8. require `operation="create"` in the first slice;
9. extract and retain `BuyerCookie`;
10. validate the supplied `BrowserFormPost/URL` against the configured HTTPS return-host allowlist;
11. create a random, one-use, short-lived PunchOut session;
12. respond with a cXML `PunchOutSetupResponse` containing a fixed-origin storefront StartPage URL.

The request must not be allowed to choose an arbitrary Magento company, customer or callback origin.

### `GET /punchout/session/[token]`

Consumes the opaque one-use StartPage token.

Responsibilities:

1. find an unexpired unused PunchOut session;
2. atomically consume the entry token;
3. establish the server-side Magento customer session through the reviewed PunchOut-to-customer exchange;
4. verify `customer` + `css_company_context`;
5. select/verify the single configured company;
6. bind the browser to the PunchOut session using a separate HttpOnly host-only cookie;
7. redirect to the normal catalogue.

The browser must never receive the SAP SharedSecret or a server credential.

### `POST /api/punchout/return`

Returns the current cart to SAP.

Responsibilities:

1. require both a valid Magento customer session and valid PunchOut session;
2. re-read the current Magento cart server-side;
3. verify the configured company remains selected and active;
4. use Magento-returned SKU, quantity, price and currency;
5. reject an empty or ineligible cart;
6. generate the exact bounded `PunchOutOrderMessage`;
7. include the original `BuyerCookie`;
8. post/form-submit only to the callback URL retained from the authenticated setup request;
9. mark the PunchOut session returned so it cannot be replayed.

The browser must not supply authoritative line prices, company IDs or a return URL at this stage.

## Basket / checkout behaviour

Normal storefront sessions remain unchanged.

```text
NORMAL SESSION
Basket
  -> Continue to checkout
  -> existing delivery/payment/order path

PUNCHOUT SESSION
Basket
  -> Return basket to SAP
  -> cXML PunchOutOrderMessage
  -> SAP
```

PunchOut mode must never fall through to native Magento `placeOrder` or Fluid credit-order submission.

The existing Magento customer cart remains the basket authority. Do not introduce a parallel local PunchOut basket.

Because Magento `customerCart` is scoped to the Magento customer, the launch PunchOut principal must be a dedicated Magento customer account assigned to the configured company and not used for ordinary human storefront login. The single-customer launch also permits only one CREATED/ACTIVE PunchOut session for that configured principal at a time. This prevents two SAP browser sessions from silently sharing one Magento basket. If the customer requires concurrent PunchOut users, that is a separate design decision rather than something to fake with parallel local baskets.

## Customer / company identity

For the one-customer launch, mapping is server-side configuration.

Conceptually:

```text
configured SAP identity
  -> configured storefront PunchOut principal
  -> configured Magento customer
  -> configured Fluid company
```

No browser value may override this mapping.

The exact mechanism for obtaining the Magento customer token is the only expected backend contract gap at PUNCH.1. Preferred shape:

```text
validated css_store PunchOut server request
  -> bounded Fluid exchange operation
  -> short-lived / normal Magento customer token
  -> css_store verifies customer + company context
```

Do not:

- store the customer's Magento password in `css_store`;
- call `generateCustomerToken` using a hidden reusable password;
- use a Magento Admin token;
- impersonate a company based only on request-supplied company identifiers.

## Configuration

Configuration is intentionally single-customer and explicit.

```text
SAP_PUNCHOUT_ENABLED
SAP_PUNCHOUT_AUTH_MODE
SAP_PUNCHOUT_FROM_DOMAIN
SAP_PUNCHOUT_FROM_IDENTITY
SAP_PUNCHOUT_TO_DOMAIN
SAP_PUNCHOUT_TO_IDENTITY
SAP_PUNCHOUT_SENDER_DOMAIN
SAP_PUNCHOUT_SENDER_IDENTITY
SAP_PUNCHOUT_SHARED_SECRET
SAP_PUNCHOUT_MAGENTO_CUSTOMER_ID
SAP_PUNCHOUT_COMPANY_ID
SAP_PUNCHOUT_STORE_CODE
SAP_PUNCHOUT_ALLOWED_RETURN_HOSTS
SAP_PUNCHOUT_STORE_ORIGIN
SAP_PUNCHOUT_SESSION_DB_PATH
SAP_PUNCHOUT_SESSION_TTL_SECONDS
SAP_PUNCHOUT_MAX_CLOCK_SKEW_SECONDS
SAP_PUNCHOUT_MAX_BODY_BYTES
SAP_PUNCHOUT_ASSERTION_PRIVATE_KEY_B64
SAP_PUNCHOUT_ASSERTION_ISSUER
SAP_PUNCHOUT_ASSERTION_AUDIENCE
SAP_PUNCHOUT_ASSERTION_KEY_ID
SAP_PUNCHOUT_ASSERTION_TTL_SECONDS
```

Secrets stay in protected production configuration and must never be committed.

`SAP_PUNCHOUT_AUTH_MODE` has exactly two values:

- `preauthenticated` — development bridge only; requires an existing exact Magento customer/company login and is forbidden in production;
- `fluid_exchange` — intended production mode through Fluid PR #108; requires the RS256 private-key configuration on css_store.

The return-host allowlist should be exact and HTTPS-only. Do not trust arbitrary `BrowserFormPost` destinations simply because the cXML credential matched.

## Session persistence

Do not put the entire SAP request into an unsigned browser cookie.

The minimum retained server-side state is:

```text
session_id / token_hash
payload_id
buyer_cookie
browser_form_post
buyer_identity
buyer user metadata needed for audit
configured company/customer binding
created_at
expires_at
entry_consumed_at
returned_at
status
```

For the current deployment, PunchOut session state belongs to `css_store` in a dedicated SQLite database at the configured absolute `SAP_PUNCHOUT_SESSION_DB_PATH`. The store uses transactional one-use state transitions and unique `payloadID` / token hashes, so state survives PM2 restarts without introducing Redis or placing SAP callback state in Magento. SQLite also remains usable if the app later has more than one local process, provided they share the same local database file.

The current PM2 topology is one `css-store` fork instance. If the application is later split across hosts, the PunchOut session store must move to a shared transactional database before scaling out; local SQLite must not silently become per-host state.

Secrets are not persisted in the session record. Entry/browser tokens are stored only as SHA-256 hashes. Expired session rows retain their unique `payloadID` until the complete accepted timestamp/replay window has elapsed, so a short browser-session TTL cannot accidentally reopen a replay window.

## cXML security invariants

The first implementation must fail closed on:

- invalid or missing configured credentials;
- malformed XML;
- any external-entity resolution and all internal DTD/entity declarations; an external cXML `SYSTEM` DTD declaration may be present but is never fetched;
- oversized request bodies;
- unsupported operation;
- missing or duplicate `payloadID`;
- timestamp outside the accepted window;
- replayed setup request;
- missing `BuyerCookie`;
- non-HTTPS return URL;
- return URL outside the configured host allowlist;
- expired or already-consumed entry token;
- expired or already-returned PunchOut session;
- customer/company context differing from the configured mapping;
- empty cart;
- cart/company eligibility changing before return.

Never log:

- SharedSecret;
- Magento customer token;
- raw credential-bearing cXML.

Audit may retain hashes and explicitly selected non-secret identifiers.

## cXML line authority

The outbound PunchOut basket must be generated from a fresh Magento cart read.

Initial mappings:

```text
SupplierPartID  <- effective Magento SKU
quantity        <- current cart item quantity
UnitPrice       <- current Magento item unit price
currency        <- Magento-returned currency
Description     <- Magento product/variant name
UnitOfMeasure   <- configured/proven value for the customer
BuyerCookie     <- retained setup request value
```

Grouped/configurable products must use the real effective purchased SKU/variant, not infer a child by naming convention.

Any customer-required UNSPSC, SupplierPartAuxiliaryID, Extrinsic or custom fields remain discovery inputs until their SAP test profile is supplied.

## PUNCH delivery sequence

### PUNCH.1 — discovery / contract

- freeze this single-customer architecture;
- obtain one real customer `PunchOutSetupRequest` fixture;
- obtain SAP test identities/SharedSecret through secure deployment configuration;
- confirm Level 1 and `operation="create"` launch scope;
- confirm required UOM / UNSPSC / Extrinsic fields;
- confirm exact allowed BrowserFormPost host(s);
- determine and prove the minimal Fluid customer-token exchange seam;
- decide durable session storage using the existing deployment topology.

No production PunchOut entry point is enabled in PUNCH.1.

### PUNCH.2 — cXML setup boundary

Current draft implementation:

- strict SAX cXML parser using `saxes`, with bounded body/depth/node counts;
- external cXML SYSTEM DTD declarations may be present but are never fetched/resolved;
- internal DTD/entity declarations are rejected;
- exact From / To / Sender credential validation;
- constant-time SharedSecret comparison;
- timestamp window validation;
- exact HTTPS BrowserFormPost hostname allowlist;
- SQLite-backed `payloadID` replay protection and one-use StartPage/browser session transitions;
- `PunchOutSetupResponse` serializer;
- synthetic accepted/rejected fixtures only;
- signed Fluid customer-session exchange client for Fluid draft PR #108;
- PunchOut checkout guard that blocks native `placeOrder` and `cssSubmitCreditOrder` submission whenever a PunchOut browser-session cookie is present;
- gated `POST /api/punchout/cxml` route returning 404 while PunchOut is disabled;
- gated one-use `GET /punchout/session/[token]` StartPage route.

Production still keeps `SAP_PUNCHOUT_ENABLED=0`, so no working production PunchOut entry point is exposed. The temporary `preauthenticated` bridge cannot be enabled under `NODE_ENV=production`.

### PUNCH.3 — storefront session

Implemented foundation:

- one-use StartPage token;
- `preauthenticated` development bridge while Fluid #108 is unavailable;
- exact customer/company/selected-company verification before the development bridge consumes the StartPage token;
- empty-cart requirement before a new PunchOut browser session can begin;
- future `fluid_exchange` path retained for Fluid #108;
- PunchOut-mode HttpOnly host-only cookie;
- catalogue entry using the existing Magento / Fluid customer context;
- logout/session-expiry clears the PunchOut cookie;
- company switching and Store -> Portal app switching are blocked during PunchOut;
- basket visibly enters PunchOut mode and no longer offers normal checkout.

The Return basket button remains disabled until the customer's real SAP return-line/form-post contract is supplied.

### PUNCH.4 — basket return

- PunchOut-aware basket CTA;
- server-side cart reread;
- cXML `PunchOutOrderMessage`;
- exact BrowserFormPost return;
- no Magento order creation;
- one-return-only session transition.

### PUNCH.5 — SAP test acceptance

Accept with the customer's SAP test team using real non-production credentials:

- successful PunchOut entry;
- correct company-specific catalogue;
- correct contract pricing;
- simple product;
- configurable product where applicable;
- quantity changes;
- return of multi-line basket;
- SKU / quantity / price / currency parity;
- rejected replay;
- rejected expired session;
- rejected wrong credentials;
- rejected wrong callback host;
- no order created in Magento by PunchOut return.

### PUNCH.6 — production enablement

Production enablement is a separate explicit decision after PUNCH.5 evidence is retained.

### Later — optional electronic PO

If required, design cXML `OrderRequest` intake as a separate write boundary. Returning a PunchOut basket to SAP does not itself create a Magento / OGL order.

## Development without Fluid #108

This mode exists so PUNCH.2/PUNCH.3 can be exercised while Magento/Fluid deployment is frozen. It is not the launch authentication mechanism.

Use a dedicated non-production Magento customer assigned to the intended test company. Do not use a real employee's normal storefront account.

Development sequence:

```text
1. run css_store outside NODE_ENV=production
2. SAP_PUNCHOUT_ENABLED=1
3. SAP_PUNCHOUT_AUTH_MODE=preauthenticated
4. configure synthetic cXML credentials + exact test customer/company/store
5. sign into css_store normally as that exact test customer
6. select the configured company and ensure customerCart is empty
7. POST the synthetic PunchOutSetupRequest to /api/punchout/cxml
8. open the returned StartPage URL
9. shop through the normal catalogue/cart
10. confirm Basket shows PunchOut mode and normal checkout/app-switch/company-switch paths are blocked
```

No Magento password is added to environment configuration. The password is entered only through the ordinary storefront login during the development test.

If the current customer token is missing, belongs to another customer, has another selected company, has an inactive company context, or has a non-empty cart, the StartPage request fails before its one-use entry token is consumed.

When Fluid #108 becomes deployable, switch to `SAP_PUNCHOUT_AUTH_MODE=fluid_exchange`; the SAP cXML/session boundary does not need to be redesigned.

## Required SAP/customer inputs

PUNCH.2 must remain fixture-led. Do not invent values for any of the items below.

Ask the customer's SAP Ariba / procurement implementation contact for the following test-profile information:

### Authentication and cXML identity

- one real non-production `PunchOutSetupRequest` captured from their SAP Ariba test environment;
- the cXML version they expect us to accept and return;
- the exact credential domains and identities SAP will send for:
  - `Header/From/Credential`;
  - `Header/To/Credential`;
  - `Header/Sender/Credential`;
- their SAP Ariba / Business Network buyer identity / NetworkID where applicable;
- the supplier identity they expect CSS to use;
- a non-production SharedSecret supplied through an agreed secure channel, never committed to Git and never pasted into fixtures or test output;
- confirmation that initial launch uses `PunchOutSetupRequest operation="create"` only;
- confirmation of any required header or setup-request `Extrinsic` values and whether their names/casing are significant.

The committed request fixture should preserve the customer's real XML structure while replacing the SharedSecret and any other secret value with an obvious non-secret placeholder.

### Browser return contract

Request:

- the exact non-production `BrowserFormPost/URL` SAP Ariba will send;
- the expected HTTPS callback host or hosts so they can be configured as an exact allowlist;
- confirmation of the form-post contract expected by their Ariba configuration for the returned `PunchOutOrderMessage`;
- any callback-path restrictions or environment-specific test URLs.

The callback URL received in an authenticated setup request may be retained for that PunchOut session, but its scheme and host must still match server configuration. A request-supplied host never becomes trusted configuration.

### Basket line contract

Confirm the exact line-level fields SAP expects from CSS:

- `UnitOfMeasure` value and code system, for example whether a simple `EA` value is required;
- UNSPSC or other `Classification` requirement and the expected classification domain;
- whether `SupplierPartAuxiliaryID` is required and, if so, what business value it must contain;
- required item-level `Extrinsic` fields, exact names/casing and expected values;
- whether line descriptions have any length or formatting restrictions;
- whether basket prices are expected ex VAT or inc VAT;
- whether SAP expects any tax element in the returned basket;
- whether currency is always GBP or must simply follow the Magento-returned cart currency.

Until these are confirmed, `SupplierPartID` is the only product identifier we can freeze: it maps to the effective Magento purchased SKU. Configurable cart lines therefore use `configured_variant.sku`; otherwise use the cart product SKU. Grouped/configurable child identity must come from Magento, never a naming convention.

### SAP test and acceptance process

Request:

- the customer's SAP Ariba test/Catalog Tester contact;
- how they want a test PunchOut supplier/catalogue activated;
- any SAP-side test identifier or catalogue name that is operationally required;
- their expected happy-path acceptance steps;
- any required negative tests in addition to wrong credentials, replay, expiry and wrong callback host;
- confirmation that Level 1 PunchOut is sufficient for launch;
- confirmation that Level 2 search/indexing is not required for launch;
- confirmation whether cXML `OrderRequest` / electronic PO delivery is a separate later requirement rather than part of PunchOut basket return.

### What the real fixture must prove

Once the real `PunchOutSetupRequest` arrives, use it to freeze rather than guess:

- actual `From`, `To` and `Sender` credential domains/identities;
- actual timestamp format and timezone representation;
- actual `payloadID` shape;
- `BuyerCookie` location/content characteristics;
- actual `BrowserFormPost/URL` host and path;
- namespace, DOCTYPE/DTD and cXML version details;
- any request `Extrinsic` elements;
- any customer-specific fields that must be echoed or mapped into the return.

The setup route now exists behind `SAP_PUNCHOUT_ENABLED` and can be exercised with synthetic credentials in a non-production development environment. Do not expose or enable the production PunchOut endpoint merely to obtain supplier information.

## Acceptance boundary

PUNCH.1 is complete when the contract above is reviewed against one real customer fixture and the Magento-token exchange path is proved without adding a reusable customer password or Admin privilege to the storefront.

Until that point, do not enable a public PunchOut route in production and do not weaken the existing storefront authentication rules.
