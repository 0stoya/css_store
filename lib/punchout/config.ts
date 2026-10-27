import path from "node:path";

export type PunchOutCredential = { domain: string; identity: string };
export type PunchOutLineMetadata = {
  uom?: string;
  unspsc?: string;
  auxiliaryId?: string;
  extrinsics?: Record<string, string>;
};
export type PunchOutProfile = {
  id: string;
  credentials: { from: PunchOutCredential; to: PunchOutCredential; sender: PunchOutCredential };
  sharedSecret: string;
  companyId: number;
  storeCode: string;
  customerIds: number[];
  allowedReturnHosts: string[];
  defaultUom?: string;
  requireUnspsc: boolean;
  priceTaxBasis: "EX_VAT" | "INC_VAT";
  deploymentMode: "test" | "production";
  browserFormField: "cXML-urlencoded" | "cXML-base64";
  lineMetadata: Record<string, PunchOutLineMetadata>;
};
export type PunchOutAuthMode = "preauthenticated" | "fluid_exchange";
export type PunchOutConfig =
  | { enabled: false }
  | {
      enabled: true;
      authMode: PunchOutAuthMode;
      profiles: PunchOutProfile[];
      sessionDbPath: string;
      sessionTtlSeconds: number;
      maxClockSkewSeconds: number;
      maxBodyBytes: number;
      storeOrigin: string;
      assertion: null | {
        privateKeyPem: string;
        issuer: string;
        audience: string;
        keyId: string;
        ttlSeconds: number;
      };
    };

type Env = Record<string, string | undefined>;
function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required.");
  return value.trim();
}
function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(label + " must be a positive integer.");
  return value;
}
function boundedInteger(value: string | undefined, fallback: number, min: number, max: number, label: string) {
  const numeric = value?.trim() ? Number(value) : fallback;
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) throw new Error(label + " is outside the allowed range.");
  return numeric;
}
function credentials(value: unknown, label: string): PunchOutCredential {
  if (!value || typeof value !== "object") throw new Error(label + " is invalid.");
  const fields = value as Record<string, unknown>;
  const domain = required(fields.domain, label + ".domain");
  const identity = required(fields.identity, label + ".identity");
  if (domain.length > 128 || identity.length > 256) throw new Error(label + " exceeds maximum length.");
  return { domain, identity };
}
function hostname(value: unknown, label: string): string {
  const host = required(value, label).toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(host) || host.includes("..")) {
    throw new Error(label + " must be an exact DNS hostname.");
  }
  return host;
}
function textOptional(value: unknown, max: number, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const result = required(value, label);
  if (result.length > max) throw new Error(label + " is too long.");
  return result;
}
function lineMetadata(value: unknown, label: string): Record<string, PunchOutLineMetadata> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be an object.");
  const result: Record<string, PunchOutLineMetadata> = {};
  for (const [sku, entry] of Object.entries(value)) {
    if (!sku || sku.length > 128 || !entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(label + " contains an invalid SKU/entry.");
    }
    const fields = entry as Record<string, unknown>;
    const extrinsics: Record<string, string> = {};
    if (fields.extrinsics !== undefined) {
      if (!fields.extrinsics || typeof fields.extrinsics !== "object" || Array.isArray(fields.extrinsics)) {
        throw new Error(label + " contains invalid extrinsics.");
      }
      for (const [key, val] of Object.entries(fields.extrinsics)) {
        if (!key || key.length > 80) throw new Error(label + " contains an invalid Extrinsic name.");
        extrinsics[key] = required(val, label + " Extrinsic " + key);
      }
    }
    result[sku] = {
      uom: textOptional(fields.uom, 32, label + ".uom"),
      unspsc: textOptional(fields.unspsc, 32, label + ".unspsc"),
      auxiliaryId: textOptional(fields.auxiliaryId, 256, label + ".auxiliaryId"),
      extrinsics: Object.keys(extrinsics).length ? extrinsics : undefined,
    };
  }
  return result;
}
export function getReservedPunchOutCustomerIds(env: Env = process.env): number[] {
  const raw = env.PUNCHOUT_RESERVED_CUSTOMER_IDS?.trim() || "";
  if (!raw) return [];
  const ids = raw.split(",").map((item) => {
    const s = item.trim();
    if (!/^[1-9][0-9]*$/.test(s)) throw new Error("Invalid reserved PunchOut customer ID.");
    return positiveInteger(Number(s), "Reserved PunchOut customer ID");
  });
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate reserved PunchOut customer ID.");
  return ids;
}
function parseProfiles(env: Env): PunchOutProfile[] {
  let input: unknown;
  try { input = JSON.parse(required(env.PUNCHOUT_PROFILES_JSON, "PUNCHOUT_PROFILES_JSON")); }
  catch { throw new Error("PUNCHOUT_PROFILES_JSON must be a JSON array."); }
  if (!Array.isArray(input) || input.length < 1 || input.length > 250) {
    throw new Error("PUNCHOUT_PROFILES_JSON requires 1 to 250 profiles.");
  }
  const reserved = new Set(getReservedPunchOutCustomerIds(env));
  if (!reserved.size) throw new Error("PUNCHOUT_RESERVED_CUSTOMER_IDS is required before enabling PunchOut.");
  const profileIds = new Set<string>(), principalIds = new Set<number>(), credentialKeys = new Set<string>();
  const activeStore = env.MAGENTO_STORE_CODE?.trim() || "default";
  return input.map((raw: unknown, index): PunchOutProfile => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid PunchOut profile.");
    const p = raw as Record<string, unknown>;
    const id = required(p.id, "profile.id");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) || profileIds.has(id)) {
      throw new Error("PunchOut profile IDs must be unique safe identifiers.");
    }
    profileIds.add(id);
    if (!p.credentials || typeof p.credentials !== "object") throw new Error("Profile credentials are required.");
    const given = p.credentials as Record<string, unknown>;
    const from = credentials(given.from, "profile.from");
    const to = credentials(given.to, "profile.to");
    const sender = credentials(given.sender, "profile.sender");
    const key = JSON.stringify([from, to, sender]);
    if (credentialKeys.has(key)) throw new Error("PunchOut credential identities cannot overlap between profiles.");
    credentialKeys.add(key);
    const sharedSecret = required(p.sharedSecret, "profile.sharedSecret");
    if (sharedSecret.length < 8) throw new Error("PunchOut SharedSecret is too short.");
    const companyId = positiveInteger(p.companyId, "profile.companyId");
    const storeCode = required(p.storeCode, "profile.storeCode");
    if (storeCode !== activeStore) throw new Error("Profile storeCode must match the configured Magento Store header.");
    if (!Array.isArray(p.customerIds) || !p.customerIds.length || p.customerIds.length > 100) {
      throw new Error("PunchOut profile needs 1 to 100 dedicated Magento customer IDs.");
    }
    const customerIds = p.customerIds.map((value: unknown) => {
      const principal = positiveInteger(value, "profile.customerIds");
      if (principalIds.has(principal)) throw new Error("PunchOut customer principals must not be shared across profiles.");
      if (!reserved.has(principal)) throw new Error("Every PunchOut customer principal must be reserved.");
      principalIds.add(principal);
      return principal;
    });
    if (!Array.isArray(p.allowedReturnHosts) || !p.allowedReturnHosts.length || p.allowedReturnHosts.length > 25) {
      throw new Error("Profile return-host allowlist is required.");
    }
    const allowedReturnHosts = p.allowedReturnHosts.map((h: unknown) => hostname(h, "allowedReturnHosts"));
    if (new Set(allowedReturnHosts).size !== allowedReturnHosts.length) throw new Error("Duplicate return host.");
    if (p.priceTaxBasis !== "EX_VAT" && p.priceTaxBasis !== "INC_VAT") {
      throw new Error("Profile must explicitly declare the verified Magento unit-price tax basis.");
    }
    if (p.deploymentMode !== "test" && p.deploymentMode !== "production") {
      throw new Error("Profile must specify the buyer deployment mode.");
    }
    if (p.browserFormField !== undefined && p.browserFormField !== "cXML-urlencoded" && p.browserFormField !== "cXML-base64") {
      throw new Error("Profile has an unsupported BrowserFormPost field.");
    }
    if (p.requireUnspsc !== undefined && typeof p.requireUnspsc !== "boolean") {
      throw new Error("Profile requireUnspsc must be a boolean.");
    }
    return {
      id, credentials: { from, to, sender }, sharedSecret, companyId, storeCode, customerIds,
      allowedReturnHosts,
      defaultUom: textOptional(p.defaultUom, 32, "profile.defaultUom"),
      requireUnspsc: p.requireUnspsc === true,
      priceTaxBasis: p.priceTaxBasis,
      deploymentMode: p.deploymentMode,
      browserFormField: p.browserFormField || "cXML-urlencoded",
      lineMetadata: lineMetadata(p.lineMetadata, "profile[" + index + "].lineMetadata"),
    };
  });
}
function getOrigin(value: string, env: Env) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || (env.NODE_ENV === "production" && url.protocol !== "https:") ||
      url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("PUNCHOUT_STORE_ORIGIN must be a clean HTTPS origin in production.");
  }
  return url.origin;
}
export function getPunchOutConfig(env: Env = process.env): PunchOutConfig {
  if (env.PUNCHOUT_ENABLED?.trim() !== "1") return { enabled: false };
  const authMode = required(env.PUNCHOUT_AUTH_MODE, "PUNCHOUT_AUTH_MODE");
  if (authMode !== "preauthenticated" && authMode !== "fluid_exchange") throw new Error("Invalid PunchOut auth mode.");
  if (authMode === "preauthenticated" && env.NODE_ENV === "production") {
    throw new Error("Preauthenticated PunchOut is forbidden in production.");
  }
  const sessionDbPath = required(env.PUNCHOUT_SESSION_DB_PATH, "PUNCHOUT_SESSION_DB_PATH");
  if (!path.isAbsolute(sessionDbPath)) throw new Error("PunchOut database path must be absolute.");
  const storeOrigin = getOrigin(required(env.PUNCHOUT_STORE_ORIGIN, "PUNCHOUT_STORE_ORIGIN"), env);
  const assertion = authMode === "fluid_exchange" ? (() => {
    const pemB64 = required(env.PUNCHOUT_ASSERTION_PRIVATE_KEY_B64, "PUNCHOUT_ASSERTION_PRIVATE_KEY_B64");
    const pem = Buffer.from(pemB64, "base64").toString("utf8").trim();
    if (!pem.startsWith("-----BEGIN ") || !pem.includes("PRIVATE KEY-----") || !pem.endsWith("-----END PRIVATE KEY-----")) {
      throw new Error("Invalid PunchOut assertion private key.");
    }
    return {
      privateKeyPem: pem,
      issuer: required(env.PUNCHOUT_ASSERTION_ISSUER, "PUNCHOUT_ASSERTION_ISSUER"),
      audience: required(env.PUNCHOUT_ASSERTION_AUDIENCE, "PUNCHOUT_ASSERTION_AUDIENCE"),
      keyId: required(env.PUNCHOUT_ASSERTION_KEY_ID, "PUNCHOUT_ASSERTION_KEY_ID"),
      ttlSeconds: boundedInteger(env.PUNCHOUT_ASSERTION_TTL_SECONDS, 60, 15, 90, "Assertion TTL"),
    };
  })() : null;
  return {
    enabled: true,
    authMode,
    profiles: parseProfiles(env),
    sessionDbPath,
    storeOrigin,
    sessionTtlSeconds: boundedInteger(env.PUNCHOUT_SESSION_TTL_SECONDS, 1800, 60, 7200, "Session TTL"),
    maxClockSkewSeconds: boundedInteger(env.PUNCHOUT_MAX_CLOCK_SKEW_SECONDS, 300, 30, 600, "Clock skew"),
    maxBodyBytes: boundedInteger(env.PUNCHOUT_MAX_BODY_BYTES, 262144, 4096, 1048576, "Body size"),
    assertion,
  };
}
export function profileForCustomer(config: Extract<PunchOutConfig, {enabled: true}>, customerId: number) {
  return config.profiles.find((p) => p.customerIds.includes(customerId)) || null;
}
