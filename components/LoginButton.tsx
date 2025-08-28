// components/LoginButton.tsx
"use client";

import { signIn } from "next-auth/react";

export default function LoginButton() {
  return (
    <button
      onClick={() => signIn("github", { callbackUrl: "/jobs" })}
      style={{ padding: "10px 14px" }}
    >
      Sign in with GitHub
    </button>
  );
}
