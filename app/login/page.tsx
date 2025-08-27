export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from '@/lib/auth';

export default async function LoginPage() {
  const session = await auth();

  return (
    <main style={{ padding: 24 }}>
      <h1>Login</h1>
      {session ? (
        <>
          <p>You are signed in as <code>{session.user?.email}</code>.</p>
          <p><a href="/api/auth/signout">Sign out</a></p>
          <p><a href="/admin">Go to Admin</a></p>
        </>
      ) : (
        <>
          <p><a href="/api/auth/signin/github">Sign in with GitHub</a></p>
        </>
      )}
    </main>
  );
}

