import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clinic Desk — Clinical intelligence workspace",
  description:
    "A clinical intelligence workspace that remembers every patient and learns what actually worked. Built on Hindsight agent memory.",
};

/**
 * Resolve the theme before first paint so there is never a flash.
 * Preference ('system' | 'light' | 'dark') is stored; the resolved value
 * ('light' | 'dark') is written to <html data-theme> which the CSS keys off.
 */
const themeScript = `(function(){try{var p=localStorage.getItem('clinicdesk-theme')||'system';var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=p==='dark'||(p!=='light'&&m)?'dark':'light';document.documentElement.dataset.theme=d;document.documentElement.style.colorScheme=d;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
