// app/api/auth/[...nextauth]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export { handlers as GET, handlers as POST } from '@/lib/auth';
