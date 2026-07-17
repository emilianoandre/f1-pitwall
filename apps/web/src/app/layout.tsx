import type { Metadata } from "next";
import "./globals.css";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "PitWall · F1 Race Intelligence",
  description: "Broadcast-style live timing, telemetry and replay for F1 sessions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Saira:wght@400;500;600;700&family=Saira+Condensed:wght@500;600;700&family=Martian+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <SignOutButton />
        {children}
      </body>
    </html>
  );
}
