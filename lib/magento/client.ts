import { redirect } from "next/navigation";
import { getMagentoConfig } from "@/lib/config";

type GraphQLErrorItem = { message?: string; extensions?: { category?: string } };
type GraphQLBody<T> = { data?: T; errors?: GraphQLErrorItem[] };

export class MagentoGraphQLError extends Error {
  constructor(
    message: string,
    public readonly category?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MagentoGraphQLError";
  }
}

function isCustomerSessionFailure(status: number, error?: GraphQLErrorItem) {
  if (status === 401 || status === 403) return true;

  const category = error?.extensions?.category?.toLowerCase() || "";
  const message = error?.message?.toLowerCase() || "";
  if (category === "graphql-authentication") return true;
  if (category !== "graphql-authorization") return false;

  return message.includes("current customer isn't authorized")
    || message.includes("current customer is not authorized")
    || (message.includes("customer token") && (message.includes("expired") || message.includes("invalid")))
    || (message.includes("consumer") && message.includes("not authorized"));
}

async function readGraphQLBody<T>(response: Response) {
  try {
    return (await response.json()) as GraphQLBody<T>;
  } catch {
    return null;
  }
}

export async function magentoGraphQL<T>(query: string, variables: Record<string, unknown> = {}, token?: string) {
  const { graphqlUrl, storeCode } = getMagentoConfig();
  let response: Response;

  try {
    response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        Store: storeCode,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MagentoGraphQLError("Magento GraphQL is unavailable.");
  }

  const body = await readGraphQLBody<T>(response);
  const firstError = body?.errors?.[0];

  if (token && isCustomerSessionFailure(response.status, firstError)) {
    redirect("/api/auth/session-expired");
  }

  if (!response.ok) {
    const fallback = response.status >= 500
      ? "Magento GraphQL is unavailable."
      : `Magento GraphQL request failed (HTTP ${response.status}).`;
    throw new MagentoGraphQLError(firstError?.message || fallback, firstError?.extensions?.category, response.status);
  }

  if (firstError) {
    throw new MagentoGraphQLError(firstError.message || "Magento GraphQL request failed.", firstError.extensions?.category, response.status);
  }
  if (!body?.data) throw new MagentoGraphQLError("Magento GraphQL returned no data.", undefined, response.status);
  return body.data;
}
