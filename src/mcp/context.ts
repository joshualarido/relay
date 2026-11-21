import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../lib/db";
import { user } from "../lib/db/schema";
import { AppError } from "../lib/errors";

export type McpContext = {
  db: AppDatabase;
  resolveOwnerId: () => string;
  now?: () => string;
};

export function resolveDefaultOwnerId(db: Pick<AppDatabase, "select">): string {
  const envUserId = process.env.RELAY_MCP_USER_ID?.trim();
  if (envUserId) {
    const found = db.select({ id: user.id }).from(user).where(eq(user.id, envUserId)).get();
    if (!found) {
      throw new AppError(404, `Configured RELAY_MCP_USER_ID (${envUserId}) was not found in the Relay database.`);
    }
    return found.id;
  }

  const envEmail = process.env.RELAY_MCP_USER_EMAIL?.trim();
  if (envEmail) {
    const found = db.select({ id: user.id }).from(user).where(eq(user.email, envEmail)).get();
    if (!found) {
      throw new AppError(404, `Configured RELAY_MCP_USER_EMAIL (${envEmail}) was not found in the Relay database.`);
    }
    return found.id;
  }

  const users = db.select({ id: user.id }).from(user).limit(2).all();
  if (users.length === 1) {
    return users[0]!.id;
  }
  if (users.length === 0) {
    throw new AppError(
      400,
      "No Relay user exists in this database yet. Sign in to Relay once first, or set RELAY_MCP_USER_ID / RELAY_MCP_USER_EMAIL.",
    );
  }
  throw new AppError(
    400,
    "Multiple users exist in this Relay database. Set RELAY_MCP_USER_EMAIL or RELAY_MCP_USER_ID to select the workspace owner.",
  );
}

export type ToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function okJson(data: unknown): ToolCallResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(error: unknown): ToolCallResult {
  if (error instanceof z.ZodError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Invalid input.",
            fields: z.flattenError(error).fieldErrors,
            issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          }, null, 2),
        },
      ],
    };
  }
  if (error instanceof AppError) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: error.message, status: error.status }, null, 2) }],
    };
  }
  const message = error instanceof Error ? error.message : "Unexpected error executing Relay tool.";
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
  };
}

export function runTool(fn: () => unknown): ToolCallResult {
  try {
    return okJson(fn());
  } catch (error) {
    return errorResult(error);
  }
}
