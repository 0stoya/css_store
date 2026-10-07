"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import {
  addGroupedConfigurableProduct,
  addNativeProducts,
  assignCartItemEmployee,
  getCustomerCartWriteContext,
} from "@/lib/magento/cart";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { getProduct, type ProductConfiguration } from "@/lib/magento/product";
import { requireCustomerToken } from "@/lib/session";

function selectedUids(formData: FormData, name: string) {
  return formData.getAll(name).map(String).map((value) => value.trim()).filter(Boolean);
}

function validateConfigurableSelection(
  product: Pick<ProductConfiguration, "configurable_options" | "variants">,
  selected: string[],
) {
  const options = product.configurable_options || [];
  if (!options.length) return null;
  if (selected.length !== options.length) throw new Error("Choose an option for every configurable attribute.");

  for (const option of options) {
    if (!option.values.some((value) => selected.includes(value.uid))) {
      throw new Error(`Choose a valid ${option.label} option.`);
    }
  }

  const variant = (product.variants || []).find((candidate) =>
    selected.every((uid) => candidate.attributes.some((attribute) => attribute.uid === uid)),
  );
  if (!variant) throw new Error("That option combination is not available.");
  if (variant.product.stock_status === "OUT_OF_STOCK") throw new Error("That option combination is out of stock.");
  return variant;
}

function message(error: unknown) {
  unstable_rethrow(error);
  return error instanceof Error ? error.message : "The product action could not be completed.";
}

function cartItemSku(item: {
  product: { sku: string };
  configured_variant?: { sku: string } | null;
}) {
  return item.configured_variant?.sku || item.product.sku;
}

function assertGroupedChildAvailable(child: NonNullable<ProductConfiguration["items"]>[number]["product"]) {
  if (!child.css_stock_info.available) {
    throw new Error(child.css_stock_info.delivery_message || `${child.name} is unavailable.`);
  }
  if (child.css_purchase_allowance?.has_active_restriction && child.css_purchase_allowance.remaining_quantity <= 0) {
    throw new Error(`${child.name} has no remaining purchase allowance.`);
  }
}

export async function addGroupedChildToCartAction(formData: FormData) {
  const token = await requireCustomerToken();
  const parentSku = String(formData.get("product_sku") || "").trim();
  const childSku = String(formData.get("grouped_child_sku") || "").trim();
  if (!parentSku) redirect("/catalogue");

  let failure: string | null = null;

  try {
    if (!childSku) throw new Error("Choose a product to add.");

    const [product, employees, before] = await Promise.all([
      getProduct(token, parentSku),
      getEmployeeOrdering(token),
      getCustomerCartWriteContext(token),
    ]);

    if (!product) throw new Error("Product could not be found.");
    if (!product.css_stock_info.available) throw new Error(product.css_stock_info.delivery_message || "Product is unavailable.");
    if (product.__typename !== "CssGroupedConfigurableProduct" && product.__typename !== "GroupedProduct") {
      throw new Error("This product is not a grouped product.");
    }

    const childIndex = (product.items || []).findIndex((item) => item.product.sku === childSku);
    if (childIndex < 0) throw new Error("That grouped product selection is no longer available.");
    const child = product.items?.[childIndex]?.product;
    if (!child) throw new Error("That grouped product selection is no longer available.");

    const quantity = Number(formData.get(`child_${childIndex}_quantity`));
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Enter a quantity greater than zero for ${child.name}.`);

    assertGroupedChildAvailable(child);

    let employeeId: number | undefined;
    if (employees.usesEmployee && employees.multiEmployeeBasket) {
      employeeId = Number(formData.get("employee_id"));
      if (!Number.isInteger(employeeId) || !employees.employees.some((employee) => employee.employee_id === employeeId)) {
        throw new Error("Choose an active Employee for this order line.");
      }
    }

    if (product.__typename === "CssGroupedConfigurableProduct") {
      if (child.__typename !== "ConfigurableProduct") {
        throw new Error(`${child.name} is not a configurable child of this grouped product.`);
      }

      const selected = selectedUids(formData, `child_${childIndex}_option`);
      const variant = validateConfigurableSelection(child, selected);
      if (!variant) throw new Error(`${child.name} does not expose configurable options.`);

      await addGroupedConfigurableProduct(token, {
        cartId: before.id,
        parentSku: product.sku,
        employeeId,
        items: [{
          configurableSku: child.sku,
          variantSku: variant.product.sku,
          quantity,
        }],
      });
    } else {
      if (child.__typename !== "SimpleProduct") {
        throw new Error(`${child.name} is not a native simple child and cannot be added through Magento's grouped-product path.`);
      }

      if (employeeId) {
        const matching = before.itemsV2.items.filter((item) => cartItemSku(item) === child.sku);
        if (matching.some((item) => item.css_employee?.employee_id !== employeeId)) {
          throw new Error(`${child.sku} is already assigned to another Employee. Adjust it from the basket before adding more.`);
        }
      }

      const after = await addNativeProducts(token, before.id, [{ sku: child.sku, quantity }]);
      if (employeeId) {
        const previousUids = new Set(before.itemsV2.items.map((item) => item.uid));
        const added = after.itemsV2.items.filter((item) => !previousUids.has(item.uid));
        for (const item of added) {
          await assignCartItemEmployee(token, after.id, item.uid, employeeId);
        }
      }
    }
  } catch (error) {
    failure = message(error);
  }

  const path = `/product/${encodeURIComponent(parentSku)}`;
  redirect(failure ? `${path}?error=${encodeURIComponent(failure)}` : `${path}?added=1`);
}
