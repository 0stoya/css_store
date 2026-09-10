import { NextResponse, type NextRequest } from "next/server";
import { clearCustomerToken } from "@/lib/session";

export async function GET(request: NextRequest) {
  await clearCustomerToken();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "Your session expired. Please sign in again.");

  return NextResponse.redirect(loginUrl);
}
