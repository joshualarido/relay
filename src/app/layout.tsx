import type { Metadata } from "next";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Relay", template: "%s | Relay" }, description: "A little less scattered. Your personal workspace." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
