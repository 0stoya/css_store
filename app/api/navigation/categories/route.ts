import { NextResponse } from "next/server";
import { getMenuCategories } from "@/lib/magento/menu-categories";
import { getCustomerToken } from "@/lib/session";
import { getEmployeeCatalogueMode } from "@/lib/employee-catalogue";

export async function GET() {
  const token = await getCustomerToken();
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  // Magento's standard category menu is the manager's, not the Employee's.
  // Hide that menu in Employee Catalogue mode rather than disclosing categories
  // outside the selected Employee's restrictions. SKU-filtered browse remains.
  if (await getEmployeeCatalogueMode(token)) {
    return NextResponse.json({ categories: [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const categories = await getMenuCategories(token);
  return NextResponse.json({ categories }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
