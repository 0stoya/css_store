# CSS Store: multi-partner cXML PunchOut Level 1

Status: **IMPLEMENTED, DISABLED — first buyer sandbox not certified**. The multi-partner Store foundation was merged in Store #94; the general multi-partner Magento seam and order guards were merged in Fluid #115/#118. The earlier single-customer Fluid #108 and Store #70 drafts are superseded, not production prerequisites.

## Scope

The existing CSS catalogue, Magento/Fluid company pricing, product restrictions, basket, Employee attribution and real cart are reused. The new PunchOut adapter accepts strict cXML setup requests and returns a cXML PunchOutOrderMessage, **not a Magento order**. Many buyer profiles can coexist. Ariba/Coupa-style cXML Level 1 is the target standard; every buyer platform and sandbox must be certified separately. SAP OCI, Level 2 indexing and incoming cXML purchase orders are deliberately NOT included.

Each profile has its own cXML Header From/To/Sender, SharedSecret, company ID, Magento Store code, pool of dedicated Magento customer IDs, exact allowed HTTPS callback hostnames, verified tax price basis, optional default UOM and per-SKU UOM/UNSPSC/AuxiliaryID/Extrinsics. A single company can support concurrent PunchOut sessions by assigning a pool of distinct Magento technical accounts (one customerCart per principal). Technical accounts must never be used for normal human login.

## Example (synthetic; no secrets)

PUNCHOUT_PROFILES_JSON is a protected server environment JSON array, for example:

~~~json
[
  {
    "id": "buyer_alpha",
    "credentials": {
      "from": {"domain": "NetworkID", "identity": "BUYER_ALPHA"},
      "to": {"domain": "NetworkID", "identity": "CSS_SUPPLIER"},
      "sender": {"domain": "NetworkID", "identity": "ARIBA_NETWORK"}
    },
    "sharedSecret": "REPLACE_FROM_SECRET_VAULT",
    "companyId": 100,
    "storeCode": "default",
    "customerIds": [1101, 1102],
    "allowedReturnHosts": ["buyer-test.example.com"],
    "priceTaxBasis": "EX_VAT",
    "deploymentMode": "test",
    "browserFormField": "cXML-urlencoded",
    "defaultUom": "EA",
    "requireUnspsc": false,
    "lineMetadata": {
      "SKU-1": {
        "uom": "EA",
        "unspsc": "46181504",
        "auxiliaryId": "VENDOR-REF",
        "extrinsics": {"BuyerField": "VERIFIED-VALUE"}
      }
    }
  }
]
~~~

The buyer profile must also select the cXML deployment mode (test or production) and supported BrowserFormPost field (cXML-urlencoded or cXML-base64).\n\n**Do not assume the example UOM, UNSPSC, Auxiliary ID, tax basis or extrinsic is right for a real buyer.** They must be confirmed from a buyer's test profile. Where UOM or required UNSPSC is absent, return is blocked. Magento pricing is never reconstructed or discounted in the adapter.

PUNCHOUT_RESERVED_CUSTOMER_IDS must include each technical Magento customer ID, even when PUNCHOUT_ENABLED=0, so losing a PunchOut browser cookie does not turn that account into a checkout-capable store user. Assigning the same Magento principal to two buyer profiles is prohibited.

## Session flow

1. POST /api/punchout/cxml: bounded strict SAX XML parser; no external-entity resolution; exact buyer credential and constant-time secret verification; timestamp window; buyer-specific payloadID replay protection; HTTPS callback allowlist; atomically lease an unused dedicated customer and return a one-use StartPage.
2. GET /punchout/session/[token]: atomically consume entry token; establish the correct Magento customer/company using a bounded backend assertion exchange. The only temporary alternative is preauthenticated development mode outside NODE_ENV=production. The production exchange resets a previously abandoned cart only after leasing a dedicated principal and verifying identity.
3. Browse our normal CSS Store catalogue and basket. PunchOut cookie and principal reservation block normal checkout, Portal switching and company switching.
4. POST /api/punchout/return: same-origin POST, active browser token, correct Magento customer/company and fresh eligible cart. Serialize actual purchased variant SKU, quantity, Magento unit/row prices, currency, verified UOM and optional metadata. One-use form POST of cXML-urlencoded to the validated buyer BrowserFormPost URL. **No Magento/Fluid order is created**.

A cart-level CSS company discount currently blocks basket return rather than exporting incorrect lines. Unit price/row totals must reconcile and all currencies match. Buyer tax and discount contracts require explicit acceptance.

The current app has a single PM2 fork. A private local SQLite session database is used for durable replay/lease/one-use state. Scale-out across hosts requires a shared transactional store first.

## StartPage outage and buyer return recovery

For production `fluid_exchange`, GET StartPage performs an **anonymous,
read-only** Magento GraphQL `__typename` readiness query **before** the
one-use entry token is consumed. If Magento GraphQL is unavailable or its
schema cannot compile, return HTTP 503 and preserve the unconsumed CREATED
session and its existing technical-customer lease; the same URL can be retried
until it expires. No assertion, customer token, cart write or reindex is
issued by this preflight. Readiness is a point-in-time check, not a guarantee
that the later exchange will succeed.

After one-use entry consumption an exchange error may be **ambiguous**:
Magento might already have minted a customer token. Never automatically
release or reassign that technical principal, and never reuse the consumed
StartPage token. Reconcile the attempt and allow normal lease expiry before
starting a new buyer setup request.

The outbound cXML `PunchOutOrderMessage` is a **basket**, not a Magento
order. The session is marked RETURNED before the browser POST to the buyer.
If the callback fails or the buyer reports an error, establish whether the
buyer created a requisition before retrying or raising a new one. Do not
automatically replay an outgoing basket with a fresh payload ID.

## Minimum first-buyer Demo acceptance (no production enablement)

1. **Environment / backend:** confirm Store runs a compatible Node/SQLite
   runtime on a **single writable PM2 instance**, Demo Magento 2.4.9/OpenSearch
   GraphQL parses, and Fluid #115/#118 reserved-ID safeguards are deployed.
   Live Magento 2.4.7/Elasticsearch7 must independently compile/deny reserved
   customers before any Live activation. No human customer ID may be reserved.
2. **Pilot profile:** obtain one real buyer *sandbox* PunchOutSetupRequest,
   From/To/Sender identifiers, SharedSecret, a dedicated active Magento
   technical customer/company/store tuple, allowlisted HTTPS BrowserFormPost
   URL, verified unit/row tax basis, UOM, required UNSPSC, auxiliary IDs and
   permitted extrinsics. Save secrets only in protected server config.
3. **Round trip:** with test-only buyer and dedicated technical principal,
   buyer launches cXML → StartPage → authorised company catalogue and prices
   → basket → browser cXML return. Compare SKU, quantity, price, currency,
   tax, UOM and buyer-accepted requisition. Verify **no Magento sales or
   credit order** was created.
4. **Denials / outage:** test wrong credentials/callback, replayed setup and
   StartPage, exhausted principal pool, expired session, Magento GraphQL
   down-before-consumption and ambiguous exchange-after-consumption. Confirm
   reserved technical IDs cannot submit native orders, GraphQL credit orders
   or REST credit orders, even with Store cookie lost and PunchOut OFF.

Keep both `PUNCHOUT_ENABLED=0` (Store) and
`css_commerce/punchout/enabled=0` (Magento) until one buyer sandbox passes
and the operator separately approves enabling the release gates. The existing
list of reserved technical customer IDs must remain protected even if
PunchOut is subsequently switched OFF.

## Go-live blockers (must be closed before enablement)

- **Verify** the merged Fluid #115 general multi-partner assertion verifier is actually deployed and returns tokens only for explicitly allowlisted (partner, customer, company, store) tuples; a GitHub merge is not deployment proof.
- **Prove at runtime** that the merged Fluid #115/#118 guards block native Magento placeOrder and both REST/GraphQL credit-order creation for reserved technical principals. Frontend/server-action guards cannot secure raw Magento requests.
- Obtain real non-production PunchOutSetupRequest, BrowserFormPost and returned basket requirements from each distinct buyer platform; verify buyer identity, actual UOM/classification, tax basis, discounts, callback field and requisition acceptance.
- Test multiple buyers with different company prices, simultaneous buyers using different principals, pool exhaustion, replay, session expiry, wrong credential/callback, grouped and configurable items, return parity, plus absence of Magento order writes.
- Verify operational DB permissions and Node 22.5+ sqlite support on the deployment host. If multiple hosts, move the session store before activation.
- Confirm incoming PO intake requirements separately. Level 1 PunchOut return is not PO import.

Run npm run typecheck, npm run lint, node --test tests/*.test.mjs, npm run test:punchout and npm run build. Leave all production flags OFF, and do not merge/deploy based on static tests alone.
