export function getMagentoConfig() {
  const graphqlUrl = process.env.MAGENTO_GRAPHQL_URL?.trim();
  if (!graphqlUrl) throw new Error("MAGENTO_GRAPHQL_URL is not configured.");
  return {
    graphqlUrl,
    storeCode: process.env.MAGENTO_STORE_CODE?.trim() || "default",
  };
}

export function getStoreName() {
  return process.env.NEXT_PUBLIC_STORE_NAME?.trim() || "Chelmsford Safety Supplies";
}
