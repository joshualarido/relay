import { requireUserId } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { listActivity } from "@/lib/activity";
import { HistoryList } from "@/components/history-list";

export default async function HistoryPage() {
  const ownerId = await requireUserId();
  return <div className="page"><header className="page-heading"><div><h1>History</h1><p>Understand changes. Recover safely.</p></div></header>
    <p className="muted mb-6">Undo and Restore refuse to overwrite later work. History does not expire; independently deleted children stay deleted. Recovery itself is recorded, not recursively undoable.</p>
    <HistoryList entries={listActivity(getDatabase(), ownerId)} />
  </div>;
}
