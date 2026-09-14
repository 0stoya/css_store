function deriveMagentoBaseUrl(graphqlUrl: string) {
  let url: URL;
  try {
    url = new URL(graphqlUrl);
  } catch {
    throw new Error("MAGENTO_GRAPHQL_URL must be an absolute URL.");
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith("/graphql")
    ? pathname.slice(0, -"/graphql".length) || "/"
    : pathname || "/";
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/+$/, "");
}

function requiredOrigin(name: "CSS_ADMIN_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);

  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || (url.pathname !== "/" && url.pathname !== "")
    || url.search
    || url.hash
  ) {
    throw new Error(`${name} must be a clean absolute origin.`);
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production.`);
  }
  url.pathname = "/";
  return url.toString().replace(/\/+$/, "");
}

export function getMagentoConfig() {
  const graphqlUrl = process.env.MAGENTO_GRAPHQL_URL?.trim();
  if (!graphqlUrl) throw new Error("MAGENTO_GRAPHQL_URL is not configured.");

  const configuredBaseUrl = process.env.MAGENTO_BASE_URL?.trim();
  const baseUrl = configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/, "")
    : deriveMagentoBaseUrl(graphqlUrl);

  return {
    graphqlUrl,
    baseUrl,
    storeCode: process.env.MAGENTO_STORE_CODE?.trim() || "default",
  };
}

export function getStoreName() {
  return process.env.NEXT_PUBLIC_STORE_NAME?.trim() || "Chelmsford Safety Supplies";
}

export function getAdminPortalUrl() {
  return requiredOrigin("CSS_ADMIN_URL");
}
