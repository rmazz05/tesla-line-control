import type { Metadata, Viewport } from "next";
import "geist/font/sans";
import "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tesla Line Control",
  description: "Production line digital twin for shift supervisors.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111214",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
