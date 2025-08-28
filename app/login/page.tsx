"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Sign in</h1>
      <button onClick={() => signIn("github")}>Sign in with GitHub</button>
    </main>
  );
}
