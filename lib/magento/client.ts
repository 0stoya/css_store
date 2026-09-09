import { getMagentoConfig } from "@/lib/config";

type GraphQLErrorItem = { message?: string; extensions?: { category?: string } };
type GraphQLBody<T> = { data?: T; errors?: GraphQLErrorItem[] };

export class MagentoGraphQLError extends Error {
  constructor(message: string, public readonly category?: string) {
    super(message);
    this.name = "MagentoGraphQLError";
  }
}

export async function magentoGraphQL<T>(query: string, variables: Record<string, unknown> = {}, token?: string) {
  const { graphqlUrl, storeCode } = getMagentoConfig();
  const response = await fetch(graphqlUrl, {
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

  if (!response.ok) throw new MagentoGraphQLError("Magento GraphQL is unavailable.");
  const body = (await response.json()) as GraphQLBody<T>;
  const firstError = body.errors?.[0];
  if (firstError) throw new MagentoGraphQLError(firstError.message || "Magento GraphQL request failed.", firstError.extensions?.category);
  if (!body.data) throw new MagentoGraphQLError("Magento GraphQL returned no data.");
  return body.data;
}
