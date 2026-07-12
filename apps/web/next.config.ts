import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Standalone output produces a self-contained server bundle (only the
  // node_modules actually traced as used) so the Docker runtime image
  // doesn't need the full pnpm workspace install.
  output: "standalone",
  // This is a pnpm workspace monorepo — trace from the repo root so hoisted
  // dependencies outside apps/web are included in the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
