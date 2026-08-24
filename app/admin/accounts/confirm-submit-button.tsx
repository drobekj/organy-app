"use client";

import type { ReactNode } from "react";

export function ConfirmSubmitButton({ message, children }: { message: string; children: ReactNode }) {
  return <button type="submit" onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{children}</button>;
}
