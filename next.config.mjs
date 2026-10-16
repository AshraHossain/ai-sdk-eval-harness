import { fileURLToPath, URL } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting runs as its own CI step (`npm run lint`).
  eslint: { ignoreDuringBuilds: true },
  // Pin the tracing root so a stray lockfile in a parent folder (e.g. ~/package-lock.json) is ignored.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
};
export default nextConfig;
