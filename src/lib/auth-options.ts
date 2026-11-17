import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AppDatabase } from "./db";
import * as schema from "./db/schema";

export function authOptions(
  database: AppDatabase,
  config: { baseURL: string; secret: string; googleClientId?: string; googleClientSecret?: string },
): BetterAuthOptions {
  if (config.secret.length < 32) throw new Error("Set BETTER_AUTH_SECRET to a persistent random secret of at least 32 characters.");
  const url = new URL(config.baseURL);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("BETTER_AUTH_URL must be an HTTP(S) app origin.");
  return {
    appName: "Relay",
    baseURL: url.origin,
    basePath: "/api/auth",
    secret: config.secret,
    database: drizzleAdapter(database, { provider: "sqlite", schema }),
    trustedOrigins: [url.origin],
    session: { cookieCache: { enabled: false } },
    socialProviders: config.googleClientId && config.googleClientSecret
      ? { google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret } }
      : {},
  };
}
