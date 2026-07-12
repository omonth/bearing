import { afterEach, describe, expect, it, vi } from "vitest";

async function getRewrites(apiUrl: string) {
  vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
  vi.resetModules();

  const { default: nextConfig } = await import("../../next.config.js");
  return nextConfig.rewrites();
}

describe("Next.js proxy rewrites", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses NEXT_PUBLIC_API_URL and normalizes its trailing slash", async () => {
    await expect(getRewrites("https://api.example.test/api/")).resolves.toContainEqual({
      source: "/api/:path*",
      destination: "https://api.example.test/api/:path*",
    });
  });

  it("falls back to the local API proxy when the configured URL is blank", async () => {
    await expect(getRewrites("")).resolves.toContainEqual({
      source: "/api/:path*",
      destination: "http://localhost:3001/api/:path*",
    });
  });
});
