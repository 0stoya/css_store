import type { NextConfig } from "next";

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

function imageRemotePatterns(): RemotePattern[] {
  const patterns: RemotePattern[] = [];
  const rawOrigins = [
    process.env.MAGENTO_BASE_URL,
    process.env.MAGENTO_GRAPHQL_URL,
    ...(process.env.MAGENTO_IMAGE_HOSTS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((host) => host.includes("://") ? host : `https://${host}`),
  ].filter((value): value is string => Boolean(value?.trim()));

  const seen = new Set<string>();

  for (const raw of rawOrigins) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;

      const key = `${url.protocol}//${url.hostname}:${url.port}`;
      if (seen.has(key)) continue;
      seen.add(key);

      patterns.push({
        protocol: url.protocol === "http:" ? "http" : "https",
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: "/**",
      });
    } catch {
      // Invalid optional image hosts are ignored; Magento config validation
      // remains authoritative at runtime.
    }
  }

  return patterns;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: imageRemotePatterns(),
    // Prefer one broadly supported optimized format. AVIF is smaller but
    // materially slower to encode on the first request and doubles cache
    // variants when offered alongside WebP.
    formats: ["image/webp"],
    qualities: [68, 75, 76, 82],
    minimumCacheTTL: 14400,
    maximumDiskCacheSize: 1_000_000_000,
  },
};

export default nextConfig;
