/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting runs as its own CI step (`npm run lint`).
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
