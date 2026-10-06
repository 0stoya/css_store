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

function graphQLOperationName(query: string) {
  return query.match(/\b(?:query|mutation)\s+([A-Za-z0-9_]+)/)?.[1] || "AnonymousGraphQL";
}

function graphQLTimingThreshold() {
  const value = Number(process.env.MAGENTO_GRAPHQL_TIMING_THRESHOLD_MS || "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function graphQLTimeoutMs() {
  const value = Number(process.env.MAGENTO_GRAPHQL_TIMEOUT_MS || "15000");
  return Number.isInteger(value) && value >= 1000 && value <= 60000 ? value : 15000;
}

function logGraphQLTiming(
  operation: string,
  startedAt: number,
  outcome: string,
  status?: number,
) {
  if (process.env.MAGENTO_GRAPHQL_TIMING !== "1") return;

  const elapsed = Date.now() - startedAt;
  if (elapsed < graphQLTimingThreshold()) return;

  const statusText = typeof status === "number" ? ` http=${status}` : "";
  console.info(`[magento:gql] ${operation} ${elapsed}ms ${outcome}${statusText}`);
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
  const operation = graphQLOperationName(query);
  const startedAt = Date.now();
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
      signal: AbortSignal.timeout(graphQLTimeoutMs()),
    });
  } catch {
    logGraphQLTiming(operation, startedAt, "network-error");
    throw new MagentoGraphQLError("Magento GraphQL is unavailable.");
  }

  const body = await readGraphQLBody<T>(response);
  const firstError = body?.errors?.[0];

  if (token && isCustomerSessionFailure(response.status, firstError)) {
    logGraphQLTiming(operation, startedAt, "session-expired", response.status);
    redirect("/api/auth/session-expired");
  }

  if (!response.ok) {
    logGraphQLTiming(operation, startedAt, "http-error", response.status);
    const fallback = response.status >= 500
      ? "Magento GraphQL is unavailable."
      : `Magento GraphQL request failed (HTTP ${response.status}).`;
    throw new MagentoGraphQLError(firstError?.message || fallback, firstError?.extensions?.category, response.status);
  }

  if (firstError) {
    logGraphQLTiming(operation, startedAt, "graphql-error", response.status);
    throw new MagentoGraphQLError(firstError.message || "Magento GraphQL request failed.", firstError.extensions?.category, response.status);
  }
  if (!body?.data) {
    logGraphQLTiming(operation, startedAt, "no-data", response.status);
    throw new MagentoGraphQLError("Magento GraphQL returned no data.", undefined, response.status);
  }

  logGraphQLTiming(operation, startedAt, "ok", response.status);
  return body.data;
}
