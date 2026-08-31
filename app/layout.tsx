import type { Metadata } from "next";
import "./globals.css";
import "./service-context-minimal.css";
import "./data-value-typography.css";
import "./workspace-shell.css";
import "./audit-history.css";
import "./maintenance-alert.css";
import "./verify-db-dialog.css";

export const metadata: Metadata = {
  title: "Organ Planner",
  description: "Church service music planning and coordination."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
