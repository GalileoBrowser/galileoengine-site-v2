import type { NextConfig } from "next";

const legacyPages = [
  "index.html",
  "platform.html",
  "roadmap.html",
  "galileo-browser.html",
  "status.html",
  "team.html",
  "support.html",
  "404.html",
  "products.html",
  "Home.dc.html",
  "About.dc.html",
  "Build.dc.html",
  "Goals.dc.html",
  "Contribute.dc.html",
  "Status.dc.html",
  "Team.dc.html",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/legacy/index.html" },
        ...legacyPages.map((page) => ({
          source: `/${page}`,
          destination: `/legacy/${page}`,
        })),
        { source: "/galileo.css", destination: "/legacy/galileo.css" },
        { source: "/site.js", destination: "/legacy/site.js" },
        { source: "/team-loren.png", destination: "/legacy/team-loren.png" },
        { source: "/team-manuel.png", destination: "/legacy/team-manuel.png" },
        { source: "/team-silviu.png", destination: "/legacy/team-silviu.png" },
        { source: "/assets/:path*", destination: "/legacy/assets/:path*" },
      ],
    };
  },
};

export default nextConfig;
