import { NextResponse } from "next/server";
import { clearCustomerToken } from "@/lib/session";

export async function GET() {
  await clearCustomerToken();

  const params = new URLSearchParams({
    error: "Your session expired. Please sign in again.",
  });

  // Keep Location relative so reverse-proxied production requests resolve on
  // the public storefront host instead of Next's internal localhost origin.
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/login?${params.toString()}`,
    },
  });
}
