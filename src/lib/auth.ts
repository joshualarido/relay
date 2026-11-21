import { cache } from "react";
import { betterAuth } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "./auth-options";
import { getDatabase } from "./db";
import { AppError } from "./errors";
import { authenticate } from "./identity";

export function authConfiguration() {
  return {
    secretReady: (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32,
    googleReady: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  };
}

let auth: ReturnType<typeof betterAuth> | undefined;

export function getAuth() {
  if (!authConfiguration().secretReady) throw new AppError(503, "Authentication is not configured. Follow the setup guide.");
  auth ??= betterAuth(authOptions(getDatabase(), {
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET!,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }));
  return auth;
}

const cachedSession = cache(async () => {
  if (!authConfiguration().secretReady) return null;
  return authenticate(getAuth(), await headers());
});

export async function currentSession(requestHeaders?: Headers) {
  if (!authConfiguration().secretReady) return null;
  if (requestHeaders) return authenticate(getAuth(), requestHeaders);
  return cachedSession();
}

export async function requireUserId(): Promise<string> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session.user.id;
}
