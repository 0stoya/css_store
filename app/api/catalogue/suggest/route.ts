import { NextRequest, NextResponse } from "next/server";
import { getProductSuggestions } from "@/lib/magento/catalogue";
import { getCustomerToken } from "@/lib/session";

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
    const suggestions = await getProductSuggestions(token, search, categoryUid, 6);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 502 });
  }
}
