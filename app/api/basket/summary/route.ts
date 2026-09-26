import { NextResponse } from "next/server";
import { getCustomerCartSummary } from "@/lib/magento/cart";
import { getCustomerToken } from "@/lib/session";

export async function GET() {
  const token = await getCustomerToken();
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const cart = await getCustomerCartSummary(token);
  return NextResponse.json({ total_quantity: cart.total_quantity }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
