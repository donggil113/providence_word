/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pdf-parse is only used server-side at upload time; keep it external so it
    // is not bundled (it ships a CommonJS build that expects to be require'd).
    serverComponentsExternalPackages: ["pdf-parse"],
  },
  webpack: (config) => {
    // pdfjs-dist(브라우저 뷰어)는 Node 전용 optional dep 'canvas' 를 참조할 수 있다.
    // 클라이언트 번들에서 이를 빈 모듈로 처리해 빌드 오류를 방지한다.
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
};

module.exports = nextConfig;
