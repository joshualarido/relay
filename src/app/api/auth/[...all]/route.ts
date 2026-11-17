import { getAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";

async function handler(request: Request) {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    return Response.json({ error: "Authentication is unavailable. Check the setup guide and try again." }, {
      status: error instanceof AppError ? error.status : 503,
    });
  }
}

export const GET = handler;
export const POST = handler;
