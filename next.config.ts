import type { NextConfig } from "next";
import { resolve } from "node:path";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  turbopack: { root: resolve(".") },
};

export default config;
