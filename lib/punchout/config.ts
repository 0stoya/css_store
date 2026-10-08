import path from "node:path";

export type PunchOutCredential = { domain: string; identity: string };
export type PunchOutAuthMode = "preauthenticated" | "fluid_exchange";

type PunchOutBaseConfig = {
  enabled: true;
  credentials: { from: PunchOutCredential; to: PunchOutCredential; sender: PunchOutCredential };
  sharedSecret: string;
  magentoCustomerId: number;
  companyId: number;
  storeCode: string;
  allowedReturnHosts: string[];
  sessionDbPath: string;
  sessionTtlSeconds: number;
  maxClockSkewSeconds: number;
  maxBodyBytes: number;
  storeOrigin: string;
};

export type PreauthenticatedPunchOutConfig = PunchOutBaseConfig & {
  authMode: "preauthenticated";
  assertion: null;
};

export type FluidExchangePunchOutConfig = PunchOutBaseConfig & {
  authMode: "fluid_exchange";
  assertion: {
    privateKeyPem: string;
    issuer: string;
    audience: string;
    keyId: string;
    ttlSeconds: number;
  };
};

export type EnabledPunchOutConfig =
  | PreauthenticatedPunchOutConfig
  | FluidExchangePunchOutConfig;

export type PunchOutConfig = { enabled: false } | EnabledPunchOutConfig;
type Env = Record<string, string | undefined>;

function required(env: Env, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(name + " is required when SAP PunchOut is enabled.");
  return value;
}

function positiveInteger(env: Env, name: string, fallback: number, min: number, max: number) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(name + " must be an integer between " + min + " and " + max + ".");
  }
  return value;
}

function configuredId(env: Env, name: string) {
  const value = Number(required(env, name));
  if (!Number.isInteger(value) || value <= 0) throw new Error(name + " must be a positive integer.");
  return value;
}

function authMode(env: Env): PunchOutAuthMode {
  const value = required(env, "SAP_PUNCHOUT_AUTH_MODE");
  if (value !== "preauthenticated" && value !== "fluid_exchange") {
    throw new Error("SAP_PUNCHOUT_AUTH_MODE must be preauthenticated or fluid_exchange.");
  }
  if (value === "preauthenticated" && env.NODE_ENV === "production") {
    throw new Error("SAP_PUNCHOUT_AUTH_MODE=preauthenticated is forbidden in production.");
  }
  return value;
}

function cleanHost(value: string) {
  const host = value.trim().toLowerCase();
  if (!host || host.includes("/") || host.includes("@") || host.includes(":")) {
    throw new Error("SAP_PUNCHOUT_ALLOWED_RETURN_HOSTS must contain HTTPS hostnames only.");
  }
  const url = new URL("https://" + host);
  if (url.hostname.toLowerCase() !== host || url.pathname !== "/" || url.port) {
    throw new Error("SAP_PUNCHOUT_ALLOWED_RETURN_HOSTS contains an invalid hostname.");
  }
  return host;
}

function allowedReturnHosts(env: Env) {
  const hosts = required(env, "SAP_PUNCHOUT_ALLOWED_RETURN_HOSTS").split(",").map(cleanHost);
  const unique = [...new Set(hosts)];
  if (!unique.length) throw new Error("SAP_PUNCHOUT_ALLOWED_RETURN_HOSTS must contain at least one hostname.");
  return unique;
}

function storeOrigin(env: Env) {
  const url = new URL(required(env, "SAP_PUNCHOUT_STORE_ORIGIN"));
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "" && url.pathname !== "/")) {
    throw new Error("SAP_PUNCHOUT_STORE_ORIGIN must be a clean absolute origin.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("SAP_PUNCHOUT_STORE_ORIGIN must use HTTP or HTTPS.");
  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("SAP_PUNCHOUT_STORE_ORIGIN must use HTTPS in production.");
  }
  url.pathname = "/";
  return url.toString().replace(/\/$/, "");
}

function privateKeyPem(env: Env) {
  const encoded = required(env, "SAP_PUNCHOUT_ASSERTION_PRIVATE_KEY_B64");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
    throw new Error("SAP_PUNCHOUT_ASSERTION_PRIVATE_KEY_B64 is not valid base64.");
  }
  const decoded = Buffer.from(encoded.replace(/\s+/g, ""), "base64").toString("utf8").trim();
  if (!decoded.includes("-----BEGIN") || !decoded.includes("PRIVATE KEY-----") || !decoded.includes("-----END")) {
    throw new Error("SAP_PUNCHOUT_ASSERTION_PRIVATE_KEY_B64 must decode to a PEM private key.");
  }
  return decoded;
}

export function getPunchOutConfig(env: Env = process.env): PunchOutConfig {
  if (env.SAP_PUNCHOUT_ENABLED?.trim() !== "1") return { enabled: false };

  const mode = authMode(env);
  const dbPath = required(env, "SAP_PUNCHOUT_SESSION_DB_PATH");
  if (!path.isAbsolute(dbPath)) throw new Error("SAP_PUNCHOUT_SESSION_DB_PATH must be an absolute path.");

  const storeCode = required(env, "SAP_PUNCHOUT_STORE_CODE");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(storeCode)) throw new Error("SAP_PUNCHOUT_STORE_CODE is invalid.");

  const base: PunchOutBaseConfig = {
    enabled: true,
    credentials: {
      from: { domain: required(env, "SAP_PUNCHOUT_FROM_DOMAIN"), identity: required(env, "SAP_PUNCHOUT_FROM_IDENTITY") },
      to: { domain: required(env, "SAP_PUNCHOUT_TO_DOMAIN"), identity: required(env, "SAP_PUNCHOUT_TO_IDENTITY") },
      sender: { domain: required(env, "SAP_PUNCHOUT_SENDER_DOMAIN"), identity: required(env, "SAP_PUNCHOUT_SENDER_IDENTITY") },
    },
    sharedSecret: required(env, "SAP_PUNCHOUT_SHARED_SECRET"),
    magentoCustomerId: configuredId(env, "SAP_PUNCHOUT_MAGENTO_CUSTOMER_ID"),
    companyId: configuredId(env, "SAP_PUNCHOUT_COMPANY_ID"),
    storeCode,
    allowedReturnHosts: allowedReturnHosts(env),
    sessionDbPath: dbPath,
    sessionTtlSeconds: positiveInteger(env, "SAP_PUNCHOUT_SESSION_TTL_SECONDS", 1800, 300, 7200),
    maxClockSkewSeconds: positiveInteger(env, "SAP_PUNCHOUT_MAX_CLOCK_SKEW_SECONDS", 300, 15, 900),
    maxBodyBytes: positiveInteger(env, "SAP_PUNCHOUT_MAX_BODY_BYTES", 262144, 16384, 1048576),
    storeOrigin: storeOrigin(env),
  };

  if (mode === "preauthenticated") {
    return { ...base, authMode: mode, assertion: null };
  }

  return {
    ...base,
    authMode: mode,
    assertion: {
      privateKeyPem: privateKeyPem(env),
      issuer: env.SAP_PUNCHOUT_ASSERTION_ISSUER?.trim() || "css-store-punchout",
      audience: env.SAP_PUNCHOUT_ASSERTION_AUDIENCE?.trim() || "css-commerce",
      keyId: env.SAP_PUNCHOUT_ASSERTION_KEY_ID?.trim() || "css-store-punchout-v1",
      ttlSeconds: positiveInteger(env, "SAP_PUNCHOUT_ASSERTION_TTL_SECONDS", 60, 30, 120),
    },
  };
}
