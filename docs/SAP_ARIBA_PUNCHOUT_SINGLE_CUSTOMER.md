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

A very small additive Fluid capability may be required to exchange a server-authenticated PunchOut session for a customer token bound to the one configured customer/company. That backend seam must be proved separately; the storefront must not store or replay a customer's Magento password.

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

Configuration names are provisional until implementation, but the model is intentionally single-customer and explicit.

```text
SAP_PUNCHOUT_ENABLED
SAP_PUNCHOUT_BUYER_IDENTITY
SAP_PUNCHOUT_SUPPLIER_IDENTITY
SAP_PUNCHOUT_SHARED_SECRET
SAP_PUNCHOUT_COMPANY_ID
SAP_PUNCHOUT_CUSTOMER_IDENTITY
SAP_PUNCHOUT_ALLOWED_RETURN_HOSTS
SAP_PUNCHOUT_SESSION_TTL_SECONDS
SAP_PUNCHOUT_MAX_CLOCK_SKEW_SECONDS
```

Secrets stay in protected production configuration and must never be committed.

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

A durable database table is preferred if the production store can run across restarts / multiple processes. An in-memory session store is not an acceptable production contract.

Secrets must not be persisted in the session record.

## cXML security invariants

The first implementation must fail closed on:

- invalid or missing configured credentials;
- malformed XML;
- external-entity / external-DTD behaviour;
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

- safe XML parser;
- strict credential / timestamp / replay validation;
- return-host allowlist;
- session persistence;
- `PunchOutSetupResponse`;
- unit fixtures for accepted and rejected requests.

### PUNCH.3 — storefront session

- one-use StartPage token;
- Fluid customer-token exchange if required;
- company verification;
- PunchOut-mode HttpOnly cookie;
- catalogue entry using existing Magento / Fluid context.

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

## Required customer inputs

Before PUNCH.2 is frozen, request:

- SAP Ariba / Business Network test buyer identity / NetworkID;
- credential domain and Sender identity;
- test SharedSecret through a secure channel;
- one real `PunchOutSetupRequest` sample;
- expected cXML version;
- confirmation that Level 1 / `create` is sufficient;
- test BrowserFormPost host / URL pattern;
- required UOM;
- required UNSPSC / classification, if any;
- required Extrinsic fields;
- whether `SupplierPartAuxiliaryID` is required;
- whether basket prices are expected ex VAT;
- test contact / Catalog Tester acceptance process;
- whether cXML `OrderRequest` is a separate requirement.

## Acceptance boundary

PUNCH.1 is complete when the contract above is reviewed against one real customer fixture and the Magento-token exchange path is proved without adding a reusable customer password or Admin privilege to the storefront.

Until that point, do not enable a public PunchOut route in production and do not weaken the existing storefront authentication rules.
