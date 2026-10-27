import { createSign, randomBytes } from "node:crypto";
import { magentoGraphQL } from "@/lib/magento/client";
import { getCustomerContext, selectCompany } from "@/lib/magento/context";
import type { PunchOutConfig } from "@/lib/punchout/config";
import type { PunchOutSession } from "@/lib/punchout/session";

const EXCHANGE = "mutation PunchOutCustomerSession($assertion:String!){css_punchout_customer_session(assertion:$assertion)}";
const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export function createPunchOutCustomerAssertion(
  config: Extract<PunchOutConfig, {enabled:true}>,
  session: PunchOutSession,
  nowMs = Date.now(),
  jti = randomBytes(24).toString("base64url"),
) {
  if (!config.assertion) throw new Error("Fluid exchange has not been configured.");
  const issuedAt = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: config.assertion.keyId };
  const payload = {
    iss: config.assertion.issuer, aud: config.assertion.audience,
    purpose: "punchout_customer_session", partner_id: session.profileId,
    sub: String(session.customerId), company_id: session.companyId, store_code: session.storeCode,
    jti, iat: issuedAt, exp: issuedAt + config.assertion.ttlSeconds,
  };
  const signingInput = base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return signingInput + "." + signer.sign(config.assertion.privateKeyPem).toString("base64url");
}
export async function exchangePunchOutCustomerSession(
  config: Extract<PunchOutConfig, {enabled:true}>, session: PunchOutSession,
) {
  const assertion = createPunchOutCustomerAssertion(config, session);
  const response = await magentoGraphQL<{css_punchout_customer_session:string}>(EXCHANGE, {assertion});
  const token = response.css_punchout_customer_session?.trim();
  if (!token) throw new Error("Fluid did not issue a PunchOut customer token.");
  const context = await getCustomerContext(token);
  const member = context.css_company_context.companies.find(
    (p) => p.company_id === session.companyId,
  );
  if (context.css_company_context.customer_id !== session.customerId ||
      !context.css_company_context.authenticated || !member?.active) {
    throw new Error("Fluid PunchOut customer identity mismatch.");
  }
  if (context.css_company_context.selected_company_id !== session.companyId) {
    await selectCompany(token, session.companyId);
  }
  const verified = await getCustomerContext(token);
  if (verified.css_company_context.customer_id !== session.customerId ||
      verified.css_company_context.selected_company_id !== session.companyId ||
      verified.css_ordering_capabilities.company_id !== session.companyId ||
      !verified.css_ordering_capabilities.company_active) {
    throw new Error("Fluid PunchOut company selection failed.");
  }
  return token;
}
