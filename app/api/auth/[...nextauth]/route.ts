// app/api/auth/[...nextauth]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
