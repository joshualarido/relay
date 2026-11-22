import { getDatabase } from "@/lib/db";
import { route } from "@/lib/http";
import { clearWorkingHoursOverride, setWorkingHoursOverride } from "@/lib/preferences";

export function PUT(request: Request, { params }: { params: Promise<{ date: string }> }) {
  return route(request, async (userId) => {
    const { date } = await params;
    return setWorkingHoursOverride(getDatabase(), userId, date, await request.json());
  });
}

export function DELETE(request: Request, { params }: { params: Promise<{ date: string }> }) {
  return route(request, async (userId) => {
    const { date } = await params;
    return clearWorkingHoursOverride(getDatabase(), userId, date);
  });
}
