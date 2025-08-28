"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export default function SiteNav({ current }: { current?: "jobs" | "upload" }) {
  return (
    <nav style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
      <Link href="/jobs" aria-current={current === "jobs" ? "page" : undefined}>Jobs</Link>
      <Link href="/upload" aria-current={current === "upload" ? "page" : undefined}>Upload</Link>
      <span style={{ flex: 1 }} />
      <button onClick={() => signOut({ callbackUrl: "/" })}>Log out</button>
    </nav>
  );
}
