import { NextResponse } from "next/server";
import { getProductBadgeValues } from "@/lib/magento/product-badges";
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
    ? body.skus.filter((sku): sku is string => typeof sku === "string").slice(0, 48)
    : [];

  if (!skus.length) {
    return NextResponse.json({ badges: {} }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const badges = await getProductBadgeValues(token, skus);

  return NextResponse.json({
    badges: Object.fromEntries(badges),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
