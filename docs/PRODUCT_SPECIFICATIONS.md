# PDP Product Specifications

The Store displays **parent-level product specifications** from the existing
Magento product attributes. It uses the current authenticated StorePdpPage
GraphQL request, without a new endpoint, database, CSV importer, or Fluid
change.

## Fields

| Section | Magento attribute | Customer label |
| --- | --- | --- |
| Safety & protection | `safety_rating` | Standards & ratings |
| Safety & protection | `safety_classification` | Safety classification |
| Safety & protection | `snr_db` | Noise reduction (SNR) |
| Materials & construction | `fabric` | Fabric |
| Materials & construction | `shell_fabric` | Shell fabric |
| Materials & construction | `lining` | Lining |
| Materials & construction | `catalogue_weight` | Weight |
| Materials & construction | `material` | Material |
| Packaging & quantities | `pack_qty` | Pack quantity |
| Packaging & quantities | `case_qty` | Case quantity |

The CSV's `catalogue_source_sku` is deliberately not displayed or used to
determine permissions, parentage, or prices.

## Grouped and configurable products

The source is always the **PDP's parent product**, for simple,
configurable, native grouped and CSS grouped-configurable product types.
The Store does not copy attributes from an arbitrary child or fetch
potentially hundreds of variants to infer agreement. If the parent has no
populated attributes, there is no Specifications section. Populate the
Magento parent if parent-level specifications should appear.

The ordering forms remain unchanged. Specifications sit below the order
section and do not affect inventory, cart quantity increments, company
entitlements, catalogue visibility, pricing, or purchase allowances.

## Formatting and safe degradation

- Standards/classifications are displayed **verbatim**, with no inferred
  certification or independently verified claim.
- `catalogue_weight` retains its supplied unit (gsm, g, kg, oz); unitless
  values are hidden rather than being misrepresented as GSM.
- `snr_db` shows numeric values in dB.
- Numeric-only Magento dropdown IDs, blanks, N/A and boolean values are
  hidden.
- Packaging allows simple quantity and multipack formats (e.g. `10`,
  `6 x 750ml`, `5 x 100 Capsules`) but removes corrupt
  marketing-text fragments; these values are **informational**, not
  minimum-order quantities.
- Values are rendered as normal React text, never HTML injection.
- Empty sections disappear entirely.
- The first query includes the ten optional Magento fields. A Magento
  GraphQL "Cannot query field" error for one of these known fields triggers
  a retry with the original PDP query, preserving ordering. Other
  GraphQL failures keep their normal handling.

## Staging test products

- `A880` — glove safety rating, pack and case quantities.
- `B5206` — footwear safety classification and lining.
- `CSH115` — workwear fabric and catalogue weight.
- One parent SKU without specification data — no empty panels.

Check values on the Magento **parent** product, not only the child sizes.
Test desktop and mobile, plus simple, configurable, native grouped and
grouped-configurable ordering.
