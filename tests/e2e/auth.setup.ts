import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { testWorkspace } from "../support/auth";

export default async function setup() {
  const dir = process.env.RELAY_TEST_DIR!;
  const workspace = await testWorkspace({
    path: join(dir, "workspace.db"),
    baseURL: "http://127.0.0.1:3100",
    secret: process.env.RELAY_TEST_SECRET!,
  });
  try {
    for (const [name, user] of [["alice", workspace.alice], ["bob", workspace.bob]] as const) {
      const cookies = await workspace.helpers.getCookies({ userId: user.id });
      writeFileSync(join(dir, `${name}.json`), JSON.stringify({ cookies, origins: [] }), { mode: 0o600 });
    }
  } finally { workspace.close(); }
}
