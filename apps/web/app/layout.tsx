import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";

import { HEAD_SCRIPT } from "@/lib/theme";

import "./globals.css";

// Bricolage for display and body; the personality comes from the opsz and wdth axes (§4.2).
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-bricolage",
  display: "swap",
});

// Plex Mono is the OS speaking: menu bar, window titles, status bars, timecodes, chips.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hackladder.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "HackLadder", template: "%s · HackLadder" },
  description: "Every hackathon hacker who's won, ranked by who they beat. Ratings from public Devpost results.",
  openGraph: { siteName: "HackLadder", type: "website" },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.svg", apple: "/app-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2EEE5" },
    { media: "(prefers-color-scheme: dark)", color: "#171512" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // HEAD_SCRIPT sets data-theme and the boot flag before React hydrates.
    <html lang="en" data-theme="paper" className={`${bricolage.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
