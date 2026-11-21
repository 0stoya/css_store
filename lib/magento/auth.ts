import { magentoGraphQL } from "@/lib/magento/client";

const LOGIN = /* GraphQL */ `
  mutation StoreLogin($email: String!, $password: String!) {
    generateCustomerToken(email: $email, password: $password) { token }
  }
`;

const REVOKE = /* GraphQL */ `mutation StoreLogout { revokeCustomerToken { result } }`;

export async function loginCustomer(email: string, password: string) {
  const data = await magentoGraphQL<{ generateCustomerToken: { token: string } }>(LOGIN, { email, password });
  const token = data.generateCustomerToken?.token?.trim();
  if (!token) throw new Error("Magento did not return a customer token.");
  return token;
}

export async function revokeCustomerToken(token: string) {
  try { await magentoGraphQL(REVOKE, {}, token); } catch { /* local logout still succeeds */ }
}

const RESET_PASSWORD = /* GraphQL */ `
  mutation StoreResetCustomerPassword($email: String!, $resetPasswordToken: String!, $newPassword: String!) {
    resetPassword(email: $email, resetPasswordToken: $resetPasswordToken, newPassword: $newPassword)
  }
`;

export async function resetCustomerPassword(email: string, resetPasswordToken: string, newPassword: string) {
  const data = await magentoGraphQL<{ resetPassword: boolean }>(
    RESET_PASSWORD,
    { email, resetPasswordToken, newPassword },
  );
  return data.resetPassword === true;
}
