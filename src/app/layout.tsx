import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service Reliability Monitor",
  description: "Lightweight self-hosted service health and version monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
