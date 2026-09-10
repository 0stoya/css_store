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
