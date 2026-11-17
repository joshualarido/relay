"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="page stack"><h1>We could not load this view.</h1><p className="muted">Your saved records remain in your workspace. Try loading the view again.</p><div><Button onClick={reset}>Try again</Button></div></div>;
}
