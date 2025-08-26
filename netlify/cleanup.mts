// =============================================
// Scheduled Function — cleanup
// =============================================
// Deletes/archives old outputs, trims caches, etc. Runs daily via netlify.toml.
// --- file: netlify/functions/cleanup.mts ---
export default async (_req: Request) => {
  // Example: prune LlmCache entries older than 30 days
  const { prisma } = await import("../../lib/db");
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.llmCache.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`cleanup: pruned ${count} cache rows`);
};

export const config = { schedule: "@daily" } as const;


