import type { Metadata } from "next";
import "./globals.css";
import "./service-context-minimal.css";
import "./data-value-typography.css";

export const metadata: Metadata = {
  title: "Organ Planner",
  description: "Planning Lifecycle First scaffold for Organ Planner."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
