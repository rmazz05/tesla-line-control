import type { Metadata, Viewport } from "next";
import "geist/font/sans";
import "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Line Control | Incident priorities",
  description: "Dynamic incident priorities, production simulation, and maintenance response planning.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111214",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
