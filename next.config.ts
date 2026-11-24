import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Staff pages are per-user and per-request (cookies + live data). Partial Prefetching would
  // prerender session shells and flag every data read outside <Suspense>; it adds nothing here.
  partialPrefetching: false,
  // react-pdf + its (patched) fontkit run in Node route handlers; don't bundle them.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  // Ship the PDF fonts and banners with the serverless functions on Vercel: react-pdf reads them
  // from disk, which file tracing cannot see. The certificate design uses public/fonts/certificate
  // and public/images/church-header.jpg.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./assets/fonts/**/*", "./assets/brand/**/*",
      "./public/fonts/certificate/**/*", "./public/images/church-header.jpg",
    ],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
