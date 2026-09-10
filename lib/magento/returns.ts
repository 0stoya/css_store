import { magentoGraphQL } from "@/lib/magento/client";

export type ReturnsConfiguration = {
  enabled: boolean;
  authenticated: boolean;
};

export type SubmitReturnRequestInput = {
  order?: string;
  email: string;
  telephone: string;
  message: string;
};

export type ReturnRequestSubmission = {
  request_id: number;
  success: boolean;
  message: string;
};

const RETURNS_CONFIGURATION = /* GraphQL */ `
  query StoreReturnsConfiguration {
    css_returns_configuration {
      enabled
      authenticated
    }
  }
`;

const SUBMIT_RETURN_REQUEST = /* GraphQL */ `
  mutation StoreSubmitReturnRequest($input: CssSubmitReturnRequestInput!) {
    cssSubmitReturnRequest(input: $input) {
      request_id
      success
      message
    }
  }
`;

export async function getReturnsConfiguration(token?: string) {
  const data = await magentoGraphQL<{ css_returns_configuration: ReturnsConfiguration }>(
    RETURNS_CONFIGURATION,
    {},
    token,
  );
  return data.css_returns_configuration;
}

export async function submitReturnRequest(token: string, input: SubmitReturnRequestInput) {
  const data = await magentoGraphQL<{ cssSubmitReturnRequest: ReturnRequestSubmission }>(
    SUBMIT_RETURN_REQUEST,
    { input },
    token,
  );
  return data.cssSubmitReturnRequest;
}
