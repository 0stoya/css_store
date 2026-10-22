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

test("specifications follow the hero and precede the remaining grouped and starter-kit order panels", () => {
  const page = source("app/product/[sku]/page.tsx");
  const marker = "<ProductSpecifications values={product}/>";
  const specsAt = page.indexOf(marker);
  const introEnd = page.indexOf("</CatalogueBadgeProvider>");
  const starterKitAt = page.indexOf('{starterKit ? <section className="card starter-kit-order-panel">');
  const otherOrderAt = page.indexOf('{!starterKit && !configurable && !simpleProduct ? <section className="card order-panel pdp-order-panel">');
  const simplePriceAt = page.indexOf('!starterKit && !storefrontPolicy.hidePrice && price ? <div className="pdp-price-card">');
  const simpleBuyAt = page.indexOf("{simpleBuyForm}", simplePriceAt);

  assert.ok(specsAt >= 0, "Specifications must render on PDP");
  assert.equal(page.split(marker).length - 1, 1, "Render only one Specifications section");
  assert.ok(specsAt > introEnd && introEnd >= 0, "Keep specifications below the PDP introduction");
  assert.ok(specsAt < starterKitAt && starterKitAt >= 0, "Place specifications above starter-kit ordering");
  assert.ok(specsAt < otherOrderAt && otherOrderAt >= 0, "Place specifications above remaining grouped ordering");
  assert.ok(simplePriceAt >= 0 && simpleBuyAt > simplePriceAt && simpleBuyAt < introEnd,
    "Simple-product purchasing now lives in the price hero, above specifications");

  // Configurable option ordering remains within the hero; avoid moving its form.
  assert.ok(page.indexOf("<ConfigurableProductControls") < specsAt);

  const layout = source("app/layout.tsx");
  assert.match(layout, /import "\.\/product-specifications\.css"/);
  const styles = source("app/product-specifications.css");
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /\.pdp-specifications-section \+ \.pdp-order-panel,[\s\S]*?\.pdp-specifications-section \+ \.starter-kit-order-panel \{\s*margin-top: 0;/);
  assert.match(styles, /\.pdp-specifications-section \{\s*margin: clamp\(28px, 4vw, 48px\) 0 38px;/);
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
  class MagentoGraphQLError extends Error {
    constructor(message, category) {
      super(message);
      this.category = category;
    }
  }
  const pdpClient = loadTypeScript(root, "lib/magento/pdp-page.ts", {
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
  return { pdpClient, MagentoGraphQLError };
}

test("the one existing PDP query reads parent attributes for all product types", async () => {
  const requests = [];
  const { pdpClient } = pdpModule(async (query, variables, token) => {
    requests.push({ query, variables, token });
    if (query.includes("query StorePdpEmployeeOrdering")) {
      return { css_company_employee_configuration: { uses_employee: false, multi_employee_basket: false } };
    }
    return fakePdpData(variables.sku.split(":")[0], variables.sku, {
      safety_rating: "EN388:2016 - 3121X",
      pack_qty: "10",
    });
  });

  for (const typename of ["SimpleProduct", "ConfigurableProduct", "GroupedProduct", "CssGroupedConfigurableProduct"]) {
    const result = await pdpClient.getPdpPageContext("customer-token", typename + ":A880");
    assert.equal(result.product.safety_rating, "EN388:2016 - 3121X");
    assert.equal(result.product.pack_qty, "10");
  }
  assert.equal(requests.length, 8);
  const productRequests = requests.filter((request) => request.query.includes("query StorePdpPage"));
  const employeeRequests = requests.filter((request) => request.query.includes("query StorePdpEmployeeOrdering"));
  assert.equal(productRequests.length, 4);
  assert.equal(employeeRequests.length, 4);
  for (const request of productRequests) {
    assert.match(request.query, /products\(/);
    assert.doesNotMatch(request.query, /css_company_employee_configuration/);
    for (const code of specifications.PRODUCT_SPECIFICATION_CODES) {
      assert.ok(request.query.includes(code), code + " should be selected on parent SKU");
    }
    assert.equal(request.token, "customer-token");
  }
  for (const request of employeeRequests) {
    assert.doesNotMatch(request.query, /products\(/);
    assert.match(request.query, /css_company_employee_configuration/);
    assert.equal(request.token, "customer-token");
  }
});

test("an unavailable Magento specification field retries the original PDP without breaking ordering", async () => {
  let calls = 0;
  const { pdpClient, MagentoGraphQLError } = pdpModule(async (query, variables) => {
    calls += 1;
    if (query.includes("query StorePdpEmployeeOrdering")) {
      return { css_company_employee_configuration: { uses_employee: false, multi_employee_basket: false } };
    }
    if (query.includes("safety_rating")) {
      throw new MagentoGraphQLError('Cannot query field "safety_rating" on type "ProductInterface".');
    }
    return fakePdpData("GroupedProduct", variables.sku);
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await pdpClient.getPdpPageContext("customer-token", "A880");
    assert.equal(calls, 3);
    assert.equal(result.product.sku, "A880");
    assert.equal(result.product.safety_rating, undefined);
    assert.equal(result.storefrontPolicy.hideAddToCart, false);
  } finally {
    console.warn = originalWarn;
  }
});

test("Employee read ACL failure does not prevent product browsing and disables ordering", async () => {
  let productCalls = 0;
  let orderingCalls = 0;
  const { pdpClient, MagentoGraphQLError } = pdpModule(async (query, variables) => {
    if (query.includes("query StorePdpEmployeeOrdering")) {
      orderingCalls += 1;
      throw new MagentoGraphQLError(
        "You are not allowed to manage employees for this company.",
        "graphql-authorization",
      );
    }
    productCalls += 1;
    return fakePdpData("GroupedProduct", variables.sku, { safety_rating: "EN388:2016 - 3121X" });
  });

  const result = await pdpClient.getPdpPageContext("buyer-token", "A800");
  assert.equal(productCalls, 1);
  assert.equal(orderingCalls, 1);
  assert.equal(result.product.sku, "A800");
  assert.equal(result.product.safety_rating, "EN388:2016 - 3121X");
  assert.equal(result.employeeOrderingBlocked, true);
  assert.deepEqual(result.employeeOrdering.employees, []);
  const page = source("app/product/[sku]/page.tsx");
  assert.match(page, /const canAdd = !employeeOrderingBlocked && !storefrontPolicy\.hideAddToCart/);
  assert.match(page, /You can view this product, but ordering is unavailable/);
});

test("Unrelated GraphQL failures in the isolated Employee request still propagate", async () => {
  const { pdpClient, MagentoGraphQLError } = pdpModule(async (query, variables) => {
    if (query.includes("query StorePdpEmployeeOrdering")) {
      throw new MagentoGraphQLError("Magento GraphQL is unavailable.", "graphql-server");
    }
    return fakePdpData("SimpleProduct", variables.sku);
  });
  await assert.rejects(pdpClient.getPdpPageContext("buyer-token", "AR245G"), /Magento GraphQL is unavailable/);
});

test("Employee ordering flags and selector eligibility are preserved when authorised", async () => {
  const { pdpClient } = pdpModule(async (query, variables) => query.includes("query StorePdpEmployeeOrdering")
    ? { css_company_employee_configuration: { uses_employee: true, multi_employee_basket: true } }
    : fakePdpData("GroupedProduct", variables.sku));

  const result = await pdpClient.getPdpPageContext("manager-token", "A800");
  assert.equal(result.employeeOrderingBlocked, false);
  assert.equal(result.employeeOrdering.usesEmployee, true);
  assert.equal(result.employeeOrdering.multiEmployeeBasket, true);
});

test("unrelated Magento GraphQL failures are not masked by the optional attribute fallback", async () => {
  let calls = 0;
  const { pdpClient, MagentoGraphQLError } = pdpModule(async () => {
    calls += 1;
    throw new MagentoGraphQLError("Upstream service unavailable");
  });
  await assert.rejects(pdpClient.getPdpPageContext("customer-token", "A880"), /Upstream service unavailable/);
  assert.equal(calls, 1);
});
