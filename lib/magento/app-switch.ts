import { getMagentoConfig } from "@/lib/config";
import { MagentoGraphQLError } from "@/lib/magento/client";

export type CustomerAppTarget = "STORE" | "PORTAL";

type GraphQLErrorItem = { message?: string; extensions?: { category?: string } };
type GraphQLResponse<TData> = { data?: TData; errors?: GraphQLErrorItem[] };

const CREATE_TICKET = /* GraphQL */ `
  mutation CreateCustomerAppSwitch($target: CssCustomerApp!, $challenge: String!) {
    cssCreateCustomerAppSwitch(target: $target, code_challenge: $challenge)
  }
`;

const EXCHANGE_TICKET = /* GraphQL */ `
  mutation ExchangeCustomerAppSwitch($code: String!, $target: CssCustomerApp!, $verifier: String!) {
    cssExchangeCustomerAppSwitch(code: $code, target: $target, code_verifier: $verifier)
  }
`;

const VALIDATE_CUSTOMER = /* GraphQL */ `
  query ValidateCustomerAppSwitch {
    customer { email }
    css_company_context { authenticated is_company_customer }
  }
`;

async function request<TData>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
) {
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

  let body: GraphQLResponse<TData> | null = null;
  try {
    body = (await response.json()) as GraphQLResponse<TData>;
  } catch {
    // A safe error is raised below without exposing the upstream body.
  }

  const firstError = body?.errors?.[0];
  if (!response.ok || firstError || !body?.data) {
    throw new MagentoGraphQLError(
      firstError?.message || "Customer app switching is unavailable.",
      firstError?.extensions?.category,
      response.status,
    );
  }

  return body.data;
}

export async function createCustomerAppSwitch(
  token: string,
  target: CustomerAppTarget,
  challenge: string,
) {
  const data = await request<{ cssCreateCustomerAppSwitch: string }>(
    CREATE_TICKET,
    { target, challenge },
    token,
  );
  return data.cssCreateCustomerAppSwitch;
}

export async function exchangeCustomerAppSwitch(
  code: string,
  target: CustomerAppTarget,
  verifier: string,
) {
  const data = await request<{ cssExchangeCustomerAppSwitch: string }>(
    EXCHANGE_TICKET,
    { code, target, verifier },
  );
  return data.cssExchangeCustomerAppSwitch;
}

export async function validateCompanyCustomerToken(token: string) {
  const data = await request<{
    customer: { email: string };
    css_company_context: { authenticated: boolean; is_company_customer: boolean };
  }>(VALIDATE_CUSTOMER, {}, token);

  return data.css_company_context.authenticated
    && data.css_company_context.is_company_customer
    && Boolean(data.customer.email);
}
