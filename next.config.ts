import type { NextConfig } from "next";
import { resolve } from "node:path";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  // The dev badge covers the account control and bottom-left links; compile/runtime errors still show.
  devIndicators: false,
  turbopack: { root: resolve(".") },
  // v3 removed History and Chat; old bookmarks land on Today.
  redirects: async () => [
    { source: "/history", destination: "/", permanent: false },
    { source: "/chat", destination: "/", permanent: false },
  ],
};

export default config;
