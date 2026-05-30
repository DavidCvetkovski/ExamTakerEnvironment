import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GlobalHeader from "@/components/layout/GlobalHeader";
import ThemeProvider from "@/components/layout/ThemeProvider";
import { ToastProvider, LiveRegion, SkipLink } from "@/components/ui";
import AuthBootstrap from "@/components/auth/AuthBootstrap";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenVision",
  description: "Assessment ecosystem replica",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen overflow-hidden flex flex-col`}
      >
        <AuthBootstrap />
        <ThemeProvider />
        <SkipLink />
        <GlobalHeader />
        <main id="main-content" className="flex-1 overflow-y-auto flex flex-col">
          {children}
        </main>
        <ToastProvider />
        <LiveRegion />
      </body>
    </html>
  );
}
