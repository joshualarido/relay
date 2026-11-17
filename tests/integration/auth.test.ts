import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { session } from "../../src/lib/db/schema";
import { authenticate } from "../../src/lib/identity";
import { assertTestTarget, testWorkspace } from "../support/auth";
import { authOptions } from "../../src/lib/auth-options";

describe("real session boundary", () => {
  let workspace: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { workspace = await testWorkspace(); });
  afterAll(() => workspace?.close());

  it("rejects anonymous and forged cookies", async () => {
    const auth = betterAuth(workspace.config);
    expect(await authenticate(auth, new Headers())).toBeNull();
    expect(await authenticate(auth, new Headers({ cookie: "better-auth.session_token=forged.signature" }))).toBeNull();
  });

  it("resolves two users through ordinary production session validation", async () => {
    const auth = betterAuth(workspace.config);
    for (const user of [workspace.alice, workspace.bob]) {
      const login = await workspace.helpers.login({ userId: user.id });
      const result = await authenticate(auth, login.headers);
      expect(result?.user.id).toBe(user.id);
    }
  });

  it("rejects an expired real session", async () => {
    const login = await workspace.helpers.login({ userId: workspace.alice.id });
    workspace.db.update(session).set({ expiresAt: new Date(0) }).where(eq(session.id, login.session.id)).run();
    expect(await authenticate(betterAuth(workspace.config), login.headers)).toBeNull();
  });

  it("ordinary auth has neither test helpers nor a test-login endpoint", async () => {
    const auth = betterAuth(workspace.config);
    expect(await auth.$context).not.toHaveProperty("test");
    const response = await auth.handler(new Request("http://127.0.0.1:3100/api/auth/test-login"));
    expect(response.status).toBe(404);
  });

  it("refuses real data paths and remote test targets", () => {
    expect(() => assertTestTarget("./data/relay.db", "http://127.0.0.1:3100")).toThrow();
    expect(() => assertTestTarget(workspace.path, "https://example.com")).toThrow();
  });

  it("creates the exact Google callback with only basic identity scopes", async () => {
    const auth = betterAuth({
      ...workspace.config,
      socialProviders: { google: { clientId: "test-client", clientSecret: "test-secret" } },
    });
    const response = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/", disableRedirect: true },
      headers: new Headers({ origin: "http://127.0.0.1:3100" }),
    });
    const url = new URL(response.url!);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3100/api/auth/callback/google");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
  });

  it("rejects missing or weak persistent auth secrets", () => {
    expect(() => authOptions(workspace.db, { baseURL: "http://localhost:3000", secret: "" })).toThrow(/secret/i);
  });
});
