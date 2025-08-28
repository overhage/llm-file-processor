export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SiteNav from "@/components/SiteNav";

export default async function UploadPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <SiteNav current="upload" />
      <h1>Upload CSV</h1>
      <form method="post" action="/api/uploads?redirect=/jobs" encType="multipart/form-data">
        <input type="file" name="file" accept=".csv,.xlsx" required />
        <div style={{ height: 8 }} />
        <button type="submit">Upload</button>
      </form>
    </main>
  );
}
