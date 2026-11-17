import process from "node:process";
import { fileURLToPath, URL } from "node:url";

/** Baseline headers for every route. /api/* gets the strict set (CSP default-src 'none') in middleware.ts. */
const pageSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // Next.js injects inline bootstrap scripts, so pages get a CSP that blocks framing,
  // plugins and <base> hijacking without needing per-request nonces.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Docker build sets NEXT_OUTPUT=standalone for a minimal traced server; local `next start` stays unchanged.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Linting runs as its own CI step (`npm run lint`).
  eslint: { ignoreDuringBuilds: true },
  // Pin the tracing root so a stray lockfile in a parent folder (e.g. ~/package-lock.json) is ignored.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  async headers() {
    return [{ source: "/:path*", headers: pageSecurityHeaders }];
  },
};
export default nextConfig;
