"use server";

import { redirect } from "next/navigation";
import {
  assignCartEmployee,
  assignCartItemEmployee,
  getCustomerCart,
  removeCartItem,
  updateCartItem,
} from "@/lib/magento/cart";
import { getEmployeeOrdering } from "@/lib/magento/employee";
import { requireCustomerToken } from "@/lib/session";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The basket could not be updated.";
}

function basketRedirect(kind: "error" | "notice", value: string): never {
  redirect(`/basket?${kind}=${encodeURIComponent(value)}`);
}

function itemUid(formData: FormData) {
  const uid = String(formData.get("item_uid") || "").trim();
  if (!uid) throw new Error("Basket item is missing.");
  return uid;
}

function employeeId(formData: FormData) {
  const id = Number(formData.get("employee_id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Choose an active Employee.");
  return id;
}

export async function updateBasketItemAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;

  try {
    const uid = itemUid(formData);
    const quantity = Number(formData.get("quantity"));
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Enter a quantity greater than zero.");

    const cart = await getCustomerCart(token);
    if (!cart.itemsV2.items.some((item) => item.uid === uid)) throw new Error("That basket item is no longer available.");
    await updateCartItem(token, cart.id, uid, quantity);
  } catch (error) {
    failure = message(error);
  }

  basketRedirect(failure ? "error" : "notice", failure || "Basket quantity updated.");
}

export async function removeBasketItemAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;

  try {
    const uid = itemUid(formData);
    const cart = await getCustomerCart(token);
    if (!cart.itemsV2.items.some((item) => item.uid === uid)) throw new Error("That basket item is no longer available.");
    await removeCartItem(token, cart.id, uid);
  } catch (error) {
    failure = message(error);
  }

  basketRedirect(failure ? "error" : "notice", failure || "Item removed from basket.");
}

export async function assignBasketEmployeeAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;

  try {
    const id = employeeId(formData);
    const [cart, ordering] = await Promise.all([getCustomerCart(token), getEmployeeOrdering(token)]);
    if (!ordering.usesEmployee) throw new Error("Employee ordering is not enabled for this company.");
    if (ordering.multiEmployeeBasket) throw new Error("This company assigns Employees per basket line.");
    if (!ordering.employees.some((employee) => employee.employee_id === id)) throw new Error("Choose an active Employee from this company.");
    if (!cart.itemsV2.items.length) throw new Error("The basket is empty.");
    await assignCartEmployee(token, cart.id, id);
  } catch (error) {
    failure = message(error);
  }

  basketRedirect(failure ? "error" : "notice", failure || "Basket Employee updated.");
}

export async function assignBasketItemEmployeeAction(formData: FormData) {
  const token = await requireCustomerToken();
  let failure: string | null = null;

  try {
    const uid = itemUid(formData);
    const id = employeeId(formData);
    const [cart, ordering] = await Promise.all([getCustomerCart(token), getEmployeeOrdering(token)]);
    if (!ordering.usesEmployee) throw new Error("Employee ordering is not enabled for this company.");
    if (!ordering.multiEmployeeBasket) throw new Error("This company uses one Employee for the whole basket.");
    if (!ordering.employees.some((employee) => employee.employee_id === id)) throw new Error("Choose an active Employee from this company.");
    if (!cart.itemsV2.items.some((item) => item.uid === uid)) throw new Error("That basket item is no longer available.");
    await assignCartItemEmployee(token, cart.id, uid, id);
  } catch (error) {
    failure = message(error);
  }

  basketRedirect(failure ? "error" : "notice", failure || "Basket line Employee updated.");
}
