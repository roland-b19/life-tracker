import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { InlineScript } from "./components/inline-script";
import { themeScript } from "./components/theme";
import { ShellListeners } from "./components/shell-listeners";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life Tracker",
  description: "Private daily tracking for your life.",
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Life Tracker",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  // The browser bar follows the system, not the Appearance switch: the page colors of `--background` in app/globals.css.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
    { media: "(prefers-color-scheme: light)", color: "#eef2f6" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The script in <head> sets data-theme before React hydrates, so React is told to keep it (suppressHydrationWarning).
    <html lang="en" suppressHydrationWarning>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <ShellListeners />
      </body>
    </html>
  );
}
