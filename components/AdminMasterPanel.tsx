// components/AdminMasterPanel.tsx
import Link from 'next/link';
import { prisma } from '@/lib/db';

function fmt(d?: Date | null) {
  return d ? new Date(d).toLocaleString() : '—';
}

const dec = (v: unknown, dp = 4) => {
  if (v == null) return '—';
  const s =
    typeof v === 'object' && v !== null && 'toString' in v
      ? (v as any).toString()
      : String(v);
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(dp) : s;
};


export default async function AdminMasterPanel({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string };
}) {
  const q = (searchParams?.q ?? '').trim();
  const page = Math.max(1, Number(searchParams?.page ?? '1') || 1);
  const take = 50;
  const skip = (page - 1) * take;

  // summary stats
  const [total, withRel, lastRow] = await Promise.all([
    prisma.masterRecord.count(),
    prisma.masterRecord.count({
      where: {
        OR: [
          { relationshipType: { not: '' } },
          { relationshipCode: { not: 0 } },
        ],
      },
    }),
    prisma.masterRecord.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ]);

  // search (optional)
  const where =
    q.length > 0
      ? {
          OR: [
            { concept_a: { contains: q, mode: 'insensitive' as const } },
            { concept_b: { contains: q, mode: 'insensitive' as const } },
            { code_a: { contains: q, mode: 'insensitive' as const } },
            { code_b: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

  const [matches, rows] = await Promise.all([
    q ? prisma.masterRecord.count({ where }) : Promise.resolve(0),
    q
      ? prisma.masterRecord.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }],
          select: {
            pairId: true,
            concept_a: true,
            code_a: true,
            system_a: true,
            concept_b: true,
            code_b: true,
            system_b: true,
            lift: true, 
            relationshipType: true,
            relationshipCode: true,
            rational: true,
            updatedAt: true,
            cooc_obs: true,
            nA: true,
            nB: true,
            total_persons: true,
          },
          skip,
          take,
        })
      : Promise.resolve([] as any[]),
  ]);

  const totalPages = q ? Math.max(1, Math.ceil(matches / take)) : 1;

  return (
    <section style={{ margin: '24px 0', padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
      <h2 style={{ margin: 0 }}>MasterRecord — Overview</h2>

      <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
        <div><b>Total records:</b> {total.toLocaleString()}</div>
        <div><b>With relationship:</b> {withRel.toLocaleString()}</div>
        <div><b>Last updated:</b> {fmt(lastRow?.updatedAt)}</div>
        <div>
          <Link href="/api/master/download">⬇️ Download CSV</Link>
        </div>
      </div>

      {/* Search */}
      <form method="get" action="/admin" style={{ marginTop: 16 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search concept_a / concept_b / code (e.g., pancreatitis)"
          style={{ width: 'min(600px, 90%)', padding: '8px 10px' }}
        />
        <button type="submit" style={{ marginLeft: 8, padding: '8px 12px' }}>
          Search
        </button>
        {q && (
          <Link href="/admin" style={{ marginLeft: 12, fontSize: 13 }}>
            Clear
          </Link>
        )}
      </form>

      {/* Results */}
      {q && (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 6, fontSize: 13 }}>
            {matches.toLocaleString()} match{matches === 1 ? '' : 'es'}
            {matches > 0 && ` — showing ${skip + 1}-${Math.min(skip + rows.length, matches)}`}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th align="left">Pair</th>
                <th align="left">A (code|system)</th>
                <th align="left">B (code|system)</th>
                <th align="right">Lift</th>
                <th align="left">Rel Type</th> 
                <th align="right">Rel Code</th>
                <th align="left">Rationale</th>
                <th align="right">cooc_obs</th>
                <th align="left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.pairId} style={{ borderTop: '1px solid #eee' }}>
                  <td><code>{r.pairId}</code></td>
                  <td title={r.concept_a}>
                    {r.concept_a} <small>({r.code_a}|{r.system_a})</small>
                  </td>
                  <td title={r.concept_b}>
                    {r.concept_b} <small>({r.code_b}|{r.system_b})</small>
                  </td>
                  <td align="right">{dec(r.lift, 4)}</td>
                  <td>{r.relationshipType || '—'}</td>
                  <td align="right">{r.relationshipCode ?? 0}</td>
                  <td title={r.rational || ''}>{r.rational || '—'}</td>
                  <td align="right">{(r.cooc_obs ?? 0).toLocaleString()}</td>
                  <td>{fmt(r.updatedAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6}>No results.</td></tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Link href={`/admin?q=${encodeURIComponent(q)}&page=${Math.max(1, page - 1)}`} aria-disabled={page === 1}>
                ◀ Prev
              </Link>
              <span style={{ fontSize: 13 }}>Page {page} / {totalPages}</span>
              <Link href={`/admin?q=${encodeURIComponent(q)}&page=${Math.min(totalPages, page + 1)}`} aria-disabled={page >= totalPages}>
                Next ▶
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
