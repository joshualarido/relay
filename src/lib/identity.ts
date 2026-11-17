import type { betterAuth } from "better-auth";

export async function authenticate(auth: ReturnType<typeof betterAuth>, headers: Headers) {
  return auth.api.getSession({ headers });
}
