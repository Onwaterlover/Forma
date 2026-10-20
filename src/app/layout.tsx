import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/components/logo";
import { maybeUserLocale } from "@/lib/ctx";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Private, evidence-informed training and nutrition tracker.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ed" },
    { media: "(prefers-color-scheme: dark)", color: "#121413" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, theme } = await maybeUserLocale();
  return (
    <html lang={locale} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
