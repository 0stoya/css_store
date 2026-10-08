import { createSign, randomBytes } from "node:crypto";
import { magentoGraphQL } from "@/lib/magento/client";
import { getCustomerContext, selectCompany } from "@/lib/magento/context";
import type { FluidExchangePunchOutConfig } from "@/lib/punchout/config";

const EXCHANGE = [
  "mutation StorePunchOutCustomerSession($assertion: String!) {",
  "  css_punchout_customer_session(assertion: $assertion)",
  "}",
].join("\n");

function base64Url(value: Buffer | string) { return Buffer.from(value).toString("base64url"); }

export function createPunchOutCustomerAssertion(
  config: FluidExchangePunchOutConfig,
  nowMs = Date.now(),
  jti = randomBytes(24).toString("base64url"),
) {
  const issuedAt = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: config.assertion.keyId };
  const payload = {
    iss: config.assertion.issuer, aud: config.assertion.audience, purpose: "punchout_customer_session",
    sub: String(config.magentoCustomerId), company_id: config.companyId, store_code: config.storeCode,
    jti, iat: issuedAt, exp: issuedAt + config.assertion.ttlSeconds,
  };
  const signingInput = base64Url(JSON.stringify(header)) + "." + base64Url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return signingInput + "." + signer.sign(config.assertion.privateKeyPem).toString("base64url");
}

export async function exchangePunchOutCustomerSession(config: FluidExchangePunchOutConfig) {
  const assertion = createPunchOutCustomerAssertion(config);
  const data = await magentoGraphQL<{ css_punchout_customer_session: string }>(EXCHANGE, { assertion });
  const token = data.css_punchout_customer_session?.trim();
  if (!token) throw new Error("Fluid did not return a PunchOut customer token.");

  const initial = await getCustomerContext(token);
  const company = initial.css_company_context.companies.find((candidate) => candidate.company_id === config.companyId);
  if (
    initial.css_company_context.customer_id !== config.magentoCustomerId ||
    !initial.css_company_context.authenticated || !company || !company.active
  ) {
    throw new Error("Fluid PunchOut token does not match the configured customer/company.");
  }

  if (initial.css_company_context.selected_company_id !== config.companyId) {
    const selected = await selectCompany(token, config.companyId) as {
      cssSelectCompany: {
        selected_company_id: number | null;
        companies: Array<{ company_id: number; active: boolean; selected: boolean }>;
      };
    };
    const selectedCompany = selected.cssSelectCompany.companies.find(
      (candidate: { company_id: number; active: boolean; selected: boolean }) => candidate.company_id === config.companyId,
    );
    if (
      selected.cssSelectCompany.selected_company_id !== config.companyId ||
      !selectedCompany?.active || !selectedCompany.selected
    ) {
      throw new Error("Fluid did not select the configured PunchOut company.");
    }
  }

  const verified = await getCustomerContext(token);
  if (
    verified.css_company_context.customer_id !== config.magentoCustomerId ||
    verified.css_company_context.selected_company_id !== config.companyId ||
    !verified.css_ordering_capabilities.authenticated ||
    verified.css_ordering_capabilities.company_id !== config.companyId ||
    !verified.css_ordering_capabilities.company_active
  ) {
    throw new Error("Fluid PunchOut customer/company verification failed.");
  }
  return token;
}
