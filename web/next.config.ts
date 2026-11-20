import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // 공개 권한 확인 전에는 검색엔진 색인 금지
          ...(process.env.SITE_ACCESS === "public" ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
