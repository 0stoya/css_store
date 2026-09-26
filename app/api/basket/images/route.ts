import { NextResponse } from "next/server";
import { getGroupedParentPresentationMap } from "@/lib/magento/cart-images";
import { getCustomerToken } from "@/lib/session";

export async function POST(request: Request) {
  const token = await getCustomerToken();
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const body = await request.json().catch(() => null) as { skus?: unknown } | null;
  const skus = Array.isArray(body?.skus)
    ? body.skus.filter((sku): sku is string => typeof sku === "string").slice(0, 50)
    : [];

  if (!skus.length) {
    return NextResponse.json({ presentations: {} }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const presentations = await getGroupedParentPresentationMap(token, skus);

  return NextResponse.json({
    presentations: Object.fromEntries(presentations),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
