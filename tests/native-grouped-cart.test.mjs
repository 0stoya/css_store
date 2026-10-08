import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import load from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("native Magento grouped children are added using the real parent contract", async () => {
  const calls = [];
  const cart = load(root, "lib/magento/cart.ts", {
    "@/lib/magento/client": {
      MagentoGraphQLError: Error,
      magentoGraphQL: async (query, variables, token) => {
        calls.push({ query, variables, token });
        return { cssAddNativeGroupedProductsToCart: { cart: { id: "cart", itemsV2: { items: [] } } } };
      },
    },
    "@/lib/magento/cart-images": {
      basketImageNeedsFallback: () => false,
      getGroupedParentPresentationMap: async () => new Map(),
    },
  });

  const result = await cart.addNativeGroupedProducts("customer-token", {
    cartId: "cart",
    parentSku: "BCR528",
    items: [{ sku: "BCR528/03", quantity: 2 }],
  });

  assert.equal(result.id, "cart");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].token, "customer-token");
  assert.match(calls[0].query, /cssAddNativeGroupedProductsToCart\(input: \$input\)/);
  assert.doesNotMatch(calls[0].query, /addProductsToCart\(cartId:/);
  assert.deepEqual(calls[0].variables.input, {
    cart_id: "cart",
    parent_sku: "BCR528",
    items: [{ sku: "BCR528/03", quantity: 2 }],
  });
});

test("native grouped cart rejects an empty selection before contacting Magento", async () => {
  const cart = load(root, "lib/magento/cart.ts", {
    "@/lib/magento/client": {
      MagentoGraphQLError: Error,
      magentoGraphQL: () => { throw new Error("should not be called"); },
    },
    "@/lib/magento/cart-images": {
      basketImageNeedsFallback: () => false,
      getGroupedParentPresentationMap: async () => new Map(),
    },
  });

  await assert.rejects(
    cart.addNativeGroupedProducts("token", { cartId: "cart", parentSku: "BCR528", items: [] }),
    /Choose at least one grouped product quantity/,
  );
});

test("both grouped PDP action paths retain the parent and never add simple children directly", () => {
  for (const path of ["app/product/[sku]/actions.ts", "app/product/[sku]/grouped-actions.ts"]) {
    const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
    assert.match(source, /addNativeGroupedProducts\(token, \{\s*cartId: before\.id,\s*parentSku: product\.sku,\s*items/);
    assert.doesNotMatch(source, /addNativeProducts\(/);
  }
});
