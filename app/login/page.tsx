// app/login/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import LoginButton from "components/LoginButton";

export const metadata: Metadata = {
  title: "OHDSI TAXIS",
  description:
    "taxis (τάξις) is a Greek word meaning order, arrangement, or rank. It's a theological concept referring to divine order and was applied to aspects like the order of priests in the Temple or proper conduct in congregational worship. The word can also refer to a biological response to a stimulus, called taxis. Working together on TAXIS we will create the world/s highest quality clinical knowledge graph.   ",
};

export default function LoginPage() {
  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>OHDSI TAXIS</h1>
      <p style={{ margin: "0 0 20px 0", color: "#444" }}>
        taxis (τάξις) is a Greek word meaning order, arrangement, or rank. It's a theological concept referring to divine order and was applied to aspects like the order of priests in the Temple or proper conduct in congregational worship. The word can also refer to a biological response to a stimulus, called taxis. 

Working together on TAXIS we will create the world/s highest quality clinical knowledge graph.   
      </p>

      <LoginButton />
    </main>
  );
}
