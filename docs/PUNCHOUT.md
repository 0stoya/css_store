# CSS Store: multi-partner cXML PunchOut Level 1

Status: **DRAFT — production disabled**. Recovers and generalises css_store PR #70. Fluid PR #108 remains a *single-customer* draft and cannot be used unchanged for this multi-partner production flow.

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

**Do not assume the example UOM, UNSPSC, Auxiliary ID, tax basis or extrinsic is right for a real buyer.** They must be confirmed from a buyer's test profile. Where UOM or required UNSPSC is absent, return is blocked. Magento pricing is never reconstructed or discounted in the adapter.

PUNCHOUT_RESERVED_CUSTOMER_IDS must include each technical Magento customer ID, even when PUNCHOUT_ENABLED=0, so losing a PunchOut browser cookie does not turn that account into a checkout-capable store user. Assigning the same Magento principal to two buyer profiles is prohibited.

## Session flow

1. POST /api/punchout/cxml: bounded strict SAX XML parser; no external-entity resolution; exact buyer credential and constant-time secret verification; timestamp window; buyer-specific payloadID replay protection; HTTPS callback allowlist; atomically lease an unused dedicated customer and return a one-use StartPage.
2. GET /punchout/session/[token]: atomically consume entry token; establish the correct Magento customer/company using a bounded backend assertion exchange. The only temporary alternative is preauthenticated development mode outside NODE_ENV=production. The production exchange resets a previously abandoned cart only after leasing a dedicated principal and verifying identity.
3. Browse our normal CSS Store catalogue and basket. PunchOut cookie and principal reservation block normal checkout, Portal switching and company switching.
4. POST /api/punchout/return: same-origin POST, active browser token, correct Magento customer/company and fresh eligible cart. Serialize actual purchased variant SKU, quantity, Magento unit/row prices, currency, verified UOM and optional metadata. One-use form POST of cXML-urlencoded to the validated buyer BrowserFormPost URL. **No Magento/Fluid order is created**.

A cart-level CSS company discount currently blocks basket return rather than exporting incorrect lines. Unit price/row totals must reconcile and all currencies match. Buyer tax and discount contracts require explicit acceptance.

The current app has a single PM2 fork. A private local SQLite session database is used for durable replay/lease/one-use state. Scale-out across hosts requires a shared transactional store first.

## Go-live blockers (must be closed before enablement)

- Generalise the single-customer Fluid #108 assertion verifier to accept ONLY explicitly allowlisted (partner_id, customer_id, company_id, store_code) pairs, with expiry, signature, issuer/audience and replay validation.
- Block native Magento placeOrder and Fluid cssSubmitCreditOrder for all dedicated technical PunchOut principals **at the backend**. Frontend/server-action guards cannot secure raw Magento GraphQL requests.
- Obtain real non-production PunchOutSetupRequest, BrowserFormPost and returned basket requirements from each distinct buyer platform; verify buyer identity, actual UOM/classification, tax basis, discounts, callback field and requisition acceptance.
- Test multiple buyers with different company prices, simultaneous buyers using different principals, pool exhaustion, replay, session expiry, wrong credential/callback, grouped and configurable items, return parity, plus absence of Magento order writes.
- Verify operational DB permissions and Node 22.x sqlite support on the deployment host. If multiple hosts, move the session store before activation.
- Confirm incoming PO intake requirements separately. Level 1 PunchOut return is not PO import.

Run npm run typecheck, npm run lint, node --test tests/*.test.mjs, npm run test:punchout and npm run build. Leave all production flags OFF, and do not merge/deploy based on static tests alone.
