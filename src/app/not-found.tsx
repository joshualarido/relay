import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="page stack" id="main"><h1>This page is not available.</h1><p className="muted">The link may be outdated, or the record may no longer be available to you.</p><div><Button asChild><Link href="/">Back to workspace</Link></Button></div></main>;
}
