import { NextResponse } from "next/server";
import { getMenuCategories } from "@/lib/magento/menu-categories";
import { getCustomerToken } from "@/lib/session";

export async function GET() {
  const token = await getCustomerToken();
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const categories = await getMenuCategories(token);
  return NextResponse.json({ categories }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
