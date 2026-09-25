import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Copinex — Member Portal",
  description: "Copy. Trade. Grow.",
};

export const viewport: Viewport = {
  themeColor: "#010b1a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans text-soft antialiased">
        <div className="app-glow pointer-events-none fixed inset-0" aria-hidden="true" />
        <div className="relative">{children}</div>
      </body>
    </html>
  );
}