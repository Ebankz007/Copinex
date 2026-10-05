"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

/**
 * Password input for the light marketing forms (login, register, reset):
 * same .auth-field structure, plus an eye toggle so members can check
 * what they typed. Toggle is type="button" so it never submits the form.
 */
export function PasswordInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "current-password",
  required = true,
  minLength,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOffIcon : EyeIcon;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ paddingRight: 44 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            display: "grid",
            placeItems: "center",
            width: 32,
            height: 32,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--muted)",
          }}
        >
          <Icon style={{ width: 19, height: 19 }} />
        </button>
      </div>
    </div>
  );
}
