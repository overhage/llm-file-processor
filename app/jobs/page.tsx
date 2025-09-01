export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import AutoRefresh from "@/components/AutoRefresh";

function fmt(d?: Date | null) {
  return d ? new Date(d).toLocaleString() : "";
}

export default async function JobsPage() {
  const session = await getServerSession(authOptions);

  // Require a signed-in user with an email address (present on default NextAuth Session)
  if (!session?.user?.email) redirect("/login");

  // Look up the DB user to obtain canonical id for filtering jobs
  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true },
  });

  if (!dbUser) redirect("/login");

  const jobs = await prisma.job.findMany({
    where: { userId: dbUser.id },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      rowsProcessed: true,
      rowsTotal: true,
      upload: { select: { originalName: true, createdAt: true, blobKey: true } },
    },
  });

  return (
    <>
      {/* Site header & navigation (client component, no props) */}
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <p className="text-sm text-neutral-600">Uploaded files and processing status</p>
        </div>

        {/* AutoRefresh expects `intervalSec` and optional `enabledByDefault` */}
        <AutoRefresh intervalSec={15} enabledByDefault />

        <p style={{ marginBottom: 12 }}>
          Signed in as <strong>{dbUser.name ?? dbUser.email}</strong>
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
                  {j.status === 'completed' ? (
                    <a
                      href={`/api/downloads?jobId=${encodeURIComponent(j.id)}`}
                      className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium border border-neutral-300 hover:bg-neutral-50"
                      download
                    >
                      Download CSV
                    </a>
                  ) : (
                    <span className="text-neutral-500">—</span>
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
    </>
  );
}
