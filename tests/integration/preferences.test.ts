import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/lib/db";
import { getPreferences, savePreferences } from "../../src/lib/preferences";
import { testWorkspace } from "../support/auth";

describe("owner preferences", () => {
  let workspace: Awaited<ReturnType<typeof testWorkspace>>;
  beforeAll(async () => { workspace = await testWorkspace(); });
  afterAll(() => workspace?.close());

  it("defaults to Jakarta and Monday", () => {
    expect(getPreferences(workspace.db, workspace.alice.id)).toMatchObject({ timezone: "Asia/Jakarta", weekStart: 1 });
  });

  it("persists across connections without changing another owner", () => {
    savePreferences(workspace.db, workspace.alice.id, { timezone: "America/Los_Angeles", weekStart: 0, expectedRevision: 0 });
    const reopened = openDatabase(workspace.path);
    try {
      expect(getPreferences(reopened, workspace.alice.id)).toMatchObject({ timezone: "America/Los_Angeles", weekStart: 0, revision: 1 });
      expect(getPreferences(reopened, workspace.bob.id)).toMatchObject({ timezone: "Asia/Jakarta", weekStart: 1 });
    } finally { reopened.$client.close(); }
  });

  it("rejects invalid timezone, unexpected owner IDs, and invalid weekdays", () => {
    for (const input of [
      { timezone: "Mars/Olympus", weekStart: 1, expectedRevision: 1 },
      { timezone: "Asia/Jakarta", weekStart: 9, expectedRevision: 1 },
      { timezone: "Asia/Jakarta", weekStart: 1, expectedRevision: 1, ownerId: workspace.bob.id },
    ]) expect(() => savePreferences(workspace.db, workspace.alice.id, input)).toThrow();
  });

  it("refuses stale preferences without changing them", () => {
    expect(() => savePreferences(workspace.db, workspace.alice.id, { timezone: "UTC", weekStart: 1, expectedRevision: 0 })).toThrow(/changed/i);
    expect(getPreferences(workspace.db, workspace.alice.id).timezone).toBe("America/Los_Angeles");
  });
});
