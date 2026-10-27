import type { Metadata } from "next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/vt323/400.css";
import "./globals.css";
import { CourtShell } from "@/components/court-shell";
export const metadata: Metadata = {
  title: "Chargeback Court — Small shop. Strong defence.",
  description: "An AI paralegal for small PayPal sellers. Gather evidence, understand your options, and respond to sandbox disputes from a retro court docket.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><CourtShell>{children}</CourtShell></body></html>;
}
