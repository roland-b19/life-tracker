import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

export const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: isProduction
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
      : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // Dev only: lets a phone on the home Wi-Fi load HMR and hydrate pages; ignored by `next build`.
  allowedDevOrigins: ["192.168.*.*"],
  // Hides the floating Next.js dev-tools "N" button.
  devIndicators: false,
  // Visited and prefetched tabs open from the browser's cache without waiting for the server (the default for pages is 0).
  // `app/providers.tsx` refreshes the cache after a write and holds a tap on a link until that refresh has started, so a
  // tab never shows what it showed before the write.
  experimental: { staleTimes: { dynamic: 120, static: 300 } },
  // The Health page used to live at /food: old bookmarks and the installed app keep working.
  async redirects() {
    return [{ source: "/food/:path*", destination: "/health/:path*", permanent: true }];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // The muscle model never changes under the same name; cache it for a year so it is fetched once per device.
      { source: "/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
