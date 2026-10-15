import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const specifications = loadTypeScript(root, "lib/product-specifications.ts");

function sectionData(values) {
  return JSON.parse(JSON.stringify(specifications.getProductSpecificationSections(values)));
}

function field(values, sectionCode, code) {
  return sectionData(values)
    .find((section) => section.code === sectionCode)
    ?.entries.find((entry) => entry.code === code)?.value ?? null;
}

test("A880 glove safety ratings and packaging are displayed as supplied", () => {
  const product = {
    safety_rating: "EN388:2016 - 3121X",
    pack_qty: "10",
    case_qty: 100,
  };
  assert.equal(field(product, "safety", "safety_rating"), "EN388:2016 - 3121X");
  assert.equal(field(product, "packaging", "pack_qty"), "10");
  assert.equal(field(product, "packaging", "case_qty"), "100");
  assert.equal(sectionData(product).length, 2);
});

test("B5206 footwear specifications keep full classification and lining text", () => {
  const product = {
    safety_rating: "EN ISO 20345:2011",
    safety_classification: "S3 SRC WR HRO",
    lining: "Moisture wicked lining with waterproof membrane.",
  };
  assert.equal(field(product, "safety", "safety_rating"), "EN ISO 20345:2011");
  assert.equal(field(product, "safety", "safety_classification"), "S3 SRC WR HRO");
  assert.equal(field(product, "materials", "lining"), product.lining);
});

test("CSH115 workwear keeps weight units and does not assume fabric GSM", () => {
  const values = { fabric: "50% polyester / 50% cotton", catalogue_weight: "220gsm" };
  assert.equal(field(values, "materials", "fabric"), values.fabric);
  assert.equal(field(values, "materials", "catalogue_weight"), "220gsm");
  assert.equal(specifications.formatProductSpecification("catalogue_weight", "5Kg"), "5Kg");
  assert.equal(specifications.formatProductSpecification("catalogue_weight", "240"), null);
});

test("SNR is labeled in dB without inventing a rating", () => {
  assert.equal(specifications.formatProductSpecification("snr_db", 31), "31 dB");
  assert.equal(specifications.formatProductSpecification("snr_db", "SNR 35 dB"), "35 dB");
  assert.equal(specifications.formatProductSpecification("snr_db", "Unknown"), null);
  assert.equal(specifications.formatProductSpecification("snr_db", 0), null);
  assert.equal(specifications.formatProductSpecification("snr_db", "99"), null);
});

test("packaging supports legitimate pack formats but excludes malformed copy", () => {
  for (const raw of ["10", "10 x 50", "6 x 750ml", "6 x 1 Litre", "5 x 100 Capsules", "200 PR"]) {
    assert.equal(specifications.formatProductSpecification("pack_qty", raw), raw);
  }
  for (const raw of [
    "N/A",
    "100 ● Sizes: 7–11 ● EN388:2016 rating: 4121A",
    "100 ● ● Hi-vis back for low light",
    "",
    "0",
  ]) {
    assert.equal(specifications.formatProductSpecification("case_qty", raw), null);
  }
});

test("missing values, dropdown option IDs and arbitrary extra attributes do not render", () => {
  assert.equal(sectionData({}).length, 0);
  assert.equal(sectionData({ case_qty: "N/A", fabric: " ", snr_db: null }).length, 0);
  assert.equal(sectionData({ fabric: "1361", material: true }).length, 0);
  assert.equal(sectionData({ catalogue_source_sku: "A880" }).length, 0);
  const view = source("components/product-specifications.tsx");
  assert.match(view, /if \(!sections\.length\) return null/);
  assert.match(view, /<dd>\{value\}<\/dd>/);
  assert.doesNotMatch(view, /dangerouslySetInnerHTML/);
});

test("specifications are after the order form on grouped and configurable PDPs", () => {
  const page = source("app/product/[sku]/page.tsx");
  const index = page.indexOf("<ProductSpecifications values={product}/>");
  assert.ok(index > page.indexOf("StarterKitBuilder"));
  assert.ok(index > page.indexOf("GroupedQuantityControl"));
  assert.ok(index > page.indexOf("ConfigurableProductControls"));
  assert.ok(index > page.lastIndexOf("</form>"));
  const layout = source("app/layout.tsx");
  assert.match(layout, /import "\.\/product-specifications\.css"/);
  const styles = source("app/product-specifications.css");
  assert.match(styles, /@media \(max-width: 560px\)/);
});

function fakePdpData(typename, sku, attributes = {}) {
  return {
    customer: { firstname: "Test", lastname: "Buyer" },
    css_company_context: { companies: [] },
    css_storefront_policy: {
      hide_price: false, hide_add_to_cart: false, add_to_cart_label: null,
    },
    css_company_employee_configuration: {
      uses_employee: false, multi_employee_basket: false,
    },
    products: { items: [{ __typename: typename, sku, name: "Test product", ...attributes }] },
  };
}

function pdpModule(queryHandler) {
  class MagentoGraphQLError extends Error {}
  const module = loadTypeScript(root, "lib/magento/pdp-page.ts", {
    "@/lib/magento/client": {
      MagentoGraphQLError,
      magentoGraphQL: queryHandler,
    },
    "@/lib/magento/employee": {
      getActiveEmployees: async () => [],
    },
    "@/lib/magento/repeat-orders": {
      getRepeatOrderLists: async () => ({ css_repeat_order_lists: [] }),
    },
    "@/lib/product-specifications": {
      PRODUCT_SPECIFICATION_CODES: specifications.PRODUCT_SPECIFICATION_CODES,
    },
  });
  return { module, MagentoGraphQLError };
}

test("the one existing PDP query reads parent attributes for all product types", async () => {
  const requests = [];
  const { module } = pdpModule(async (query, variables, token) => {
    requests.push({ query, variables, token });
    return fakePdpData(variables.sku.split(":")[0], variables.sku, {
      safety_rating: "EN388:2016 - 3121X",
      pack_qty: "10",
    });
  });

  for (const typename of ["SimpleProduct", "ConfigurableProduct", "GroupedProduct", "CssGroupedConfigurableProduct"]) {
    const result = await module.getPdpPageContext("customer-token", typename + ":A880");
    assert.equal(result.product.safety_rating, "EN388:2016 - 3121X");
    assert.equal(result.product.pack_qty, "10");
  }
  assert.equal(requests.length, 4);
  for (const request of requests) {
    assert.match(request.query, /products\(/);
    for (const code of specifications.PRODUCT_SPECIFICATION_CODES) {
      assert.ok(request.query.includes(code), code + " should be selected on parent SKU");
    }
    assert.equal(request.token, "customer-token");
  }
});

test("an unavailable Magento specification field retries the original PDP without breaking ordering", async () => {
  let calls = 0;
  const { module, MagentoGraphQLError } = pdpModule(async (query, variables) => {
    calls += 1;
    if (query.includes("safety_rating")) {
      throw new MagentoGraphQLError('Cannot query field "safety_rating" on type "ProductInterface".');
    }
    return fakePdpData("GroupedProduct", variables.sku);
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await module.getPdpPageContext("customer-token", "A880");
    assert.equal(calls, 2);
    assert.equal(result.product.sku, "A880");
    assert.equal(result.product.safety_rating, undefined);
    assert.equal(result.storefrontPolicy.hideAddToCart, false);
  } finally {
    console.warn = originalWarn;
  }
});

test("unrelated Magento GraphQL failures are not masked by the optional attribute fallback", async () => {
  let calls = 0;
  const { module, MagentoGraphQLError } = pdpModule(async () => {
    calls += 1;
    throw new MagentoGraphQLError("Upstream service unavailable");
  });
  await assert.rejects(module.getPdpPageContext("customer-token", "A880"), /Upstream service unavailable/);
  assert.equal(calls, 1);
});
