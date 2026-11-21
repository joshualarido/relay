import type { NextConfig } from "next";
import { resolve } from "node:path";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  poweredByHeader: false,
  // The dev badge covers the account control and bottom-left links; compile/runtime errors still show.
  devIndicators: false,
  // Revisiting a screen within 30 s paints from the client router cache; mutations call router.refresh().
  experimental: { staleTimes: { dynamic: 30 } },
  turbopack: { root: resolve(".") },
  // v3 removed History and Chat; old bookmarks land on Today.
  redirects: async () => [
    { source: "/history", destination: "/", permanent: false },
    { source: "/chat", destination: "/", permanent: false },
  ],
};

export default config;
