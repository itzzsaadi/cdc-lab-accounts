import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CDC Lab Accounts & Asset Management System",
  description: "Phase 0 scaffold — placeholder UI pending the Google Stitch design handoff.",
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
