"use server";

import { redirect } from "next/navigation";
import {
  addGroupedConfigurableProduct,
  addNativeProduct,
  addNativeProducts,
  assignCartEmployee,
  assignCartItemEmployee,
  getCustomerCartWriteContext,
} from "@/lib/magento/cart";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { getProduct, type ProductConfiguration } from "@/lib/magento/product";
import { requireCustomerToken } from "@/lib/session";

function positiveQuantity(value: FormDataEntryValue | null) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Enter a quantity greater than zero.");
  return quantity;
}

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
  return error instanceof Error ? error.message : "The product could not be added to the basket.";
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

export async function addProductToCartAction(formData: FormData) {
  const token = await requireCustomerToken();
  const sku = String(formData.get("product_sku") || "").trim();
  if (!sku) redirect("/catalogue");

  let failure: string | null = null;

  try {
    const [product, employees, before] = await Promise.all([
      getProduct(token, sku),
      getEmployeeOrdering(token),
      getCustomerCartWriteContext(token),
    ]);
    if (!product) throw new Error("Product could not be found.");
    if (!product.css_stock_info.available) throw new Error(product.css_stock_info.delivery_message || "Product is unavailable.");

    let employeeId: number | undefined;
    if (employees.usesEmployee) {
      employeeId = Number(formData.get("employee_id"));
      if (!Number.isInteger(employeeId) || !employees.employees.some((employee) => employee.employee_id === employeeId)) {
        throw new Error("Choose an active Employee for this order.");
      }
    }

    if (product.__typename === "CssGroupedConfigurableProduct") {
      const items: Array<{ configurableSku: string; variantSku: string; quantity: number }> = [];
      const childCount = product.items?.length || 0;

      for (let index = 0; index < childCount; index += 1) {
        const childSku = String(formData.get(`child_${index}_sku`) || "").trim();
        const child = (product.items || []).find((item) => item.product.sku === childSku)?.product;
        if (!child) throw new Error("A grouped product selection is no longer available.");

        const rawQuantity = Number(formData.get(`child_${index}_quantity`));
        if (!Number.isFinite(rawQuantity) || rawQuantity < 0) throw new Error(`Enter a valid quantity for ${child.name}.`);
        if (rawQuantity === 0) continue;

        assertGroupedChildAvailable(child);
        if (child.__typename !== "ConfigurableProduct") {
          throw new Error(`${child.name} is not a configurable child of this Fluid grouped product.`);
        }

        const selected = selectedUids(formData, `child_${index}_option`);
        const variant = validateConfigurableSelection(child, selected);
        if (!variant) throw new Error(`${child.name} does not expose configurable options.`);
        items.push({ configurableSku: child.sku, variantSku: variant.product.sku, quantity: rawQuantity });
      }

      if (!items.length) throw new Error("Choose at least one grouped product quantity.");
      const cart = await addGroupedConfigurableProduct(token, {
        cartId: before.id,
        parentSku: product.sku,
        employeeId,
        items,
      });
      if (employeeId && !employees.multiEmployeeBasket) {
        await assignCartEmployee(token, cart.id, employeeId);
      }
    } else if (product.__typename === "GroupedProduct") {
      const items: Array<{ sku: string; quantity: number }> = [];
      const childCount = product.items?.length || 0;

      for (let index = 0; index < childCount; index += 1) {
        const childSku = String(formData.get(`child_${index}_sku`) || "").trim();
        const child = (product.items || []).find((item) => item.product.sku === childSku)?.product;
        if (!child) throw new Error("A grouped product selection is no longer available.");

        const rawQuantity = Number(formData.get(`child_${index}_quantity`));
        if (!Number.isFinite(rawQuantity) || rawQuantity < 0) throw new Error(`Enter a valid quantity for ${child.name}.`);
        if (rawQuantity === 0) continue;

        assertGroupedChildAvailable(child);
        if (child.__typename !== "SimpleProduct") {
          throw new Error(`${child.name} is not a native simple child and cannot be added through Magento's grouped-product path.`);
        }
        items.push({ sku: child.sku, quantity: rawQuantity });
      }

      if (!items.length) throw new Error("Choose at least one grouped product quantity.");

      if (employeeId && employees.multiEmployeeBasket) {
        for (const selected of items) {
          const matching = before.itemsV2.items.filter((item) => cartItemSku(item) === selected.sku);
          if (matching.some((item) => item.css_employee?.employee_id !== employeeId)) {
            throw new Error(`${selected.sku} is already assigned to another Employee. Adjust it from the basket before adding more.`);
          }
        }
      }

      const after = await addNativeProducts(token, before.id, items);
      if (employeeId) {
        if (!employees.multiEmployeeBasket) {
          await assignCartEmployee(token, after.id, employeeId);
        } else {
          const previousUids = new Set(before.itemsV2.items.map((item) => item.uid));
          const added = after.itemsV2.items.filter((item) => !previousUids.has(item.uid));
          for (const item of added) {
            await assignCartItemEmployee(token, after.id, item.uid, employeeId);
          }
        }
      }
    } else if (product.__typename === "SimpleProduct" || product.__typename === "ConfigurableProduct") {
      const quantity = positiveQuantity(formData.get("quantity"));
      const selected = selectedUids(formData, "selected_option");
      const variant = product.__typename === "ConfigurableProduct"
        ? validateConfigurableSelection(product, selected)
        : null;
      const effectiveSku = variant?.product.sku || product.sku;

      let matchingExisting = null;
      if (employeeId && employees.multiEmployeeBasket) {
        matchingExisting = before.itemsV2.items.find((item) => cartItemSku(item) === effectiveSku) || null;
        if (matchingExisting && matchingExisting.css_employee?.employee_id !== employeeId) {
          throw new Error("This exact product option is already assigned to another Employee. Use a different option or adjust it from the basket.");
        }
      }

      const after = await addNativeProduct(token, before.id, {
        sku: product.sku,
        quantity,
        selectedOptions: selected,
      });

      if (employeeId) {
        if (!employees.multiEmployeeBasket) {
          await assignCartEmployee(token, after.id, employeeId);
        } else if (!matchingExisting) {
          const previousUids = new Set(before.itemsV2.items.map((item) => item.uid));
          const added = after.itemsV2.items.filter((item) => !previousUids.has(item.uid));
          if (added.length !== 1) {
            throw new Error("Magento did not expose a unique new basket line for Employee assignment.");
          }
          await assignCartItemEmployee(token, after.id, added[0].uid, employeeId);
        }
      }
    } else {
      throw new Error("This Magento product type does not yet have an accepted add-to-cart path.");
    }
  } catch (error) {
    failure = message(error);
  }

  const path = `/product/${encodeURIComponent(sku)}`;
  redirect(failure ? `${path}?error=${encodeURIComponent(failure)}` : `${path}?added=1`);
}
