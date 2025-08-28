// app/login/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import LoginButton from "../../components/LoginButton";

export const metadata: Metadata = {
  title: "OHDSI TAXIS",
  description:
    "Working together on TAXIS we will create the worlds highest quality clinical knowledge graph.",
};

export default function LoginPage() {
  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>OHDSI TAXIS</h1>
      <p style={{ margin: "0 0 20px 0", color: "#444" }}>
        Working together on TAXIS we will create the worlds highest quality clinical knowledge graph.
      </p>

      <LoginButton />
    </main>
  );
}
