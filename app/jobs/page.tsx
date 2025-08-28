export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import AutoRefresh from "@/components/AutoRefresh";

function fmt(d?: Date | null) {
  return d ? new Date(d).toLocaleString() : "";
}

export default async function JobsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  // Lookup the signed-in user's DB row to get their id
  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true },
  });
  if (!me) redirect("/login");

  const jobs = await prisma.job.findMany({
    where: { userId: me.id }, // <-- only this user's jobs
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      rowsTotal: true,
      rowsProcessed: true,
      outputBlobKey: true,
      createdAt: true,
      finishedAt: true,
      upload: { select: { originalName: true, blobKey: true, createdAt: true } },
    },
  });

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <SiteNav current="jobs" />
      <h1>Your Uploads</h1>
      <AutoRefresh intervalSec={10} enabledByDefault={true} />
      <p style={{ marginBottom: 12 }}>
        Signed in as <strong>{me.name ?? me.email}</strong>
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            <th align="left">Job</th>
            <th align="left">File</th>
            <th align="left">Uploaded</th>
            <th align="left">Status</th>
            <th align="right">Rows</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} style={{ borderTop: "1px solid #eee" }}>
              <td><code>{j.id}</code></td>
              <td title={j.upload?.blobKey ?? undefined}>
                {j.upload?.originalName ?? "—"}
              </td>
              <td>{fmt(j.upload?.createdAt)}</td>
              <td>{j.status}</td>
              <td align="right">
                {(j.rowsProcessed ?? 0).toLocaleString()}/
                {(j.rowsTotal ?? 0).toLocaleString()}
              </td>
              <td>
                {j.status === "completed" ? (
                  <Link href={`/api/downloads/${j.id}`}>Download</Link>
                ) : (
                  <span style={{ color: "#888" }}>—</span>
                )}
              </td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr><td colSpan={6}>No jobs yet. Head to the Upload page.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
