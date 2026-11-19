import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { themeScript } from "./components/theme";
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
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The script in <head> sets data-theme before React hydrates, so React is told to keep it (suppressHydrationWarning).
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
