import type { NextConfig } from "next";
import path from "path";

// Featured images/avatars/branding assets are all served from this one
// media host (MinIO in dev, S3/CDN in production) - resolved from a single
// full-URL env var to match the NEXT_PUBLIC_API_URL/NEXT_PUBLIC_SITE_URL
// convention already used elsewhere, rather than three separate
// protocol/host/port vars.
const mediaUrl = new URL(
  process.env.NEXT_PUBLIC_MEDIA_URL ?? "http://localhost:9002/ainews-media",
);

const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1");
const isDev = process.env.NODE_ENV === "development";

// No nonces here deliberately: this app leans on static generation and
// ISR (see the public API's Cache-Control work) for its reader-facing
// pages, and nonce-based CSP forces every page to render dynamically
// (Next's own CSP docs are explicit about this tradeoff) - 'unsafe-inline'
// is Next's documented baseline for apps that don't need a strict,
// nonce-based policy, and still blocks the actual threat this exists to
// stop: a third-party origin sneaking in a script/image/fetch target that
// isn't this app's own API or media host. 'unsafe-eval' is dev-only, for
// React's dev-mode stack-trace reconstruction (also per Next's own docs).
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: ${mediaUrl.origin};
  font-src 'self';
  connect-src 'self' ${apiUrl.origin};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  // Standalone output produces a self-contained server bundle (only the
  // node_modules actually traced as used) so the Docker runtime image
  // doesn't need the full pnpm workspace install.
  output: "standalone",
  // This is a pnpm workspace monorepo — trace from the repo root so hoisted
  // dependencies outside apps/web are included in the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  images: {
    remotePatterns: [
      {
        protocol: mediaUrl.protocol.replace(":", "") as "http" | "https",
        hostname: mediaUrl.hostname,
        port: mediaUrl.port,
        pathname: `${mediaUrl.pathname}/**`,
      },
    ],
    formats: ["image/avif", "image/webp"],
    // Next 16 refuses by default to optimize an image whose hostname
    // resolves to a private/local IP (a real SSRF guard) - dev's media
    // host is localhost (MinIO), which is exactly that, so it needs this
    // opt-in locally. Left off in production, where the media host is a
    // real public domain (S3/CDN) and this guard should stay active.
    dangerouslyAllowLocalIP: isDev,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
