import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function WorkspaceNotFound() {
  return <div className="page stack"><h1>This record is not available.</h1><p className="muted">It may have been deleted, or it may not belong to your workspace.</p><div><Button asChild><Link href="/projects">Back to projects</Link></Button></div></div>;
}
