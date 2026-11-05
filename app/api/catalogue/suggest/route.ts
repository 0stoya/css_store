import { NextRequest, NextResponse } from "next/server";
import { getProductSuggestions } from "@/lib/magento/catalogue";
import { getCustomerToken } from "@/lib/session";
import { requireSelectedPolicy } from "@/lib/employee-catalogue";

export async function GET(request: NextRequest) {
  const token = await getCustomerToken();
  if (!token) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("q")?.trim() || "";
  const categoryUid = request.nextUrl.searchParams.get("category")?.trim() || "";

  if (search.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const scope = await requireSelectedPolicy(token);
    const suggestions = await getProductSuggestions(token, search, categoryUid, 6);
    const permitted = scope
      ? suggestions.filter((item) => scope.policy.skus.includes(item.sku))
      : suggestions;
    return NextResponse.json({ suggestions: permitted }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 502 });
  }
}
