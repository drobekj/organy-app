"use client";

import { InputHTMLAttributes, useState } from "react";

type PasswordVisibilityFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  id: string;
  label: string;
};

export function PasswordVisibilityField({ id, label, style, ...inputProps }: PasswordVisibilityFieldProps) {
  const [visible, setVisible] = useState(false);
  const visibilityLabel = visible ? "Hide password" : "Show password";

  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <label htmlFor={id}>{label}</label>
      <span style={{ position: "relative", display: "block" }}>
        <input
          {...inputProps}
          id={id}
          type={visible ? "text" : "password"}
          style={{ ...style, paddingRight: "2.75rem" }}
        />
        <button
          type="button"
          aria-label={visibilityLabel}
          aria-pressed={visible}
          title={visibilityLabel}
          onClick={() => setVisible((value) => !value)}
          style={{
            position: "absolute",
            insetInlineEnd: "0.35rem",
            top: "50%",
            transform: "translateY(-50%)",
            width: "2rem",
            height: "2rem",
            display: "grid",
            placeItems: "center",
            padding: 0,
            border: 0,
            borderRadius: "0.4rem",
            background: "transparent",
            color: "inherit",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
            <circle cx="12" cy="12" r="2.75" />
            {visible && <path d="M4 4 20 20" />}
          </svg>
        </button>
      </span>
    </div>
  );
}
