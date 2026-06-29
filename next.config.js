/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pdf-parse is only used server-side at upload time; keep it external so it
    // is not bundled (it ships a CommonJS build that expects to be require'd).
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

module.exports = nextConfig;
